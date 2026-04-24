# Instruction 027: Cloud Feed Small Memory TTL Cache Plan

## 1. Goal

为 Cloud discovery feed 路由设计一个“小内存、短 TTL、严格受限”的进程内缓存方案，用于改善以下两个页面的使用体验：

- 节目详情页（show page）
- `See all` 点击后的节目列表页（episodes page）

目标不是长期保存 feed 数据，也不是把 feed cache 当作数据库，而是减少短时间内对同一个 feed URL 的重复抓取和重复解析。

---

## 2. Decision

采用：

- 进程内内存缓存
- 缓存对象为完整解析后的 `ParsedFeed`
- 短 TTL
- 小容量上限
- 超大 feed 不准入
- `limit` 仅影响响应切片，不影响缓存键和缓存内容
- 仅服务 fresh entry；TTL 过期后必须重新抓取，不能复用 stale feed

明确不采用：

- 原始 XML 持久化
- SQLite feed cache
- 磁盘 JSON cache
- 无上限内存缓存
- 复用现有 discovery top/lookup 的 stale-fallback cache 语义

---

## 3. Why This Plan

### 3.1 当前问题

当前 `/api/v1/discovery/feed` 每次请求都会：

1. 重新请求上游 `feedUrl`
2. 重新下载完整 XML
3. 重新解析全部 episode
4. 再把 JSON 返回给前端

这导致：

- show page 首次进入慢
- 从 show page 进入 `See all` 后会再次重复抓取同一个 feed
- 同一用户短时间内反复进入节目页面时，重复支付同一成本

### 3.2 为什么不做长期持久化

feed 数据天然有时效性：

- 节目会新增新集
- 旧集 metadata 可能被修正
- description / transcript / artwork 可能更新

因此 feed 不适合作为长期保存的业务真相。

### 3.3 为什么现在不做磁盘 cache

磁盘 cache 虽然可行，但复杂度明显更高：

- 文件命名与映射
- TTL 与清理
- 原子写入
- 损坏恢复
- 并发读写

在当前单机、1GB VPS 的前提下，优先级不如“小内存短 TTL cache”。

---

## 4. Scope

### In Scope

- `apps/cloud-api` feed 路由的进程内短 TTL cache 设计
- 仅缓存完整 `ParsedFeed`
- show page 与 episodes page 的复用路径
- 小容量与准入限制

### Out of Scope

- 磁盘缓存
- Redis
- 原始 XML 缓存
- 复杂分页 / cursor 设计
- early-stop streaming 解析

---

## 5. Cache Shape

### 5.1 Cache Key

使用规范化后的 feed URL 作为 cache key：

- key: `normalizeFeedUrl(feedUrl)`

必须保证：

- `http://example.com/feed.xml`
- `HTTP://EXAMPLE.COM:80/feed.xml#ignored`

归一化后命中同一个 key。

第一阶段要求明确：

- lowercase scheme 与 host
- 去掉 fragment
- 去掉默认端口 `:80` / `:443`
- 保留 path
- 保留 query string
- 不将 `limit` 纳入 key

### 5.2 Cache Value

缓存值为完整解析后的 `ParsedFeed`，不是裁切后的局部响应。

建议结构：

```go
type cachedParsedFeed struct {
  payload    parsedFeedResponse
  expiresAt  time.Time
  cachedAt   time.Time
  byteSize   int
  feedURL    string
}
```

如果实现需要淘汰排序，允许增加：

```go
lastAccessAt time.Time
```

但第一阶段不强制 LRU。

### 5.3 Why Full ParsedFeed

如果缓存的是完整 `ParsedFeed`：

- show page 可取前 `N` 集
- episodes page 可复用同一个完整 payload
- 同一节目短时间内再次进入无需重新抓取 feed

如果只缓存前 20 集，则 `See all` 仍然必须重新抓取，收益不足。

---

## 6. TTL And Capacity

### 6.1 TTL

推荐 TTL：

- `5 minutes`

理由：

- 足够覆盖“show page -> see all -> back -> re-enter”的常见使用路径
- 不会长期持有已过时 feed 数据

### 6.2 Max Entries

推荐上限：

- `10` 到 `20` 个 feed entries

对 1GB VPS，建议默认：

- `maxEntries = 12`

### 6.3 Admission Guard

超大 feed 不进入缓存。

建议任一命中即拒绝缓存：

- `len(payload.Episodes) > 300`
- 或估算序列化体积 `> 1 MB`

注意：

- “拒绝缓存”不等于请求失败
- 只是这次请求返回结果，但不写入 cache

### 6.4 Eviction

第一阶段固定使用 `oldest-first eviction`。

要求：

- 超出 `maxEntries` 时淘汰 `cachedAt` 最早的 entry
- eviction 只影响性能，不影响正确性

如果某个 feed 被淘汰：

- 下一次请求重新抓取上游 feed
- 功能仍然正确，只是变慢

### 6.5 Singleflight

同一个 normalized feed URL 的并发 miss 必须合并成一次上游抓取。

要求：

- 使用现有 `discoveryService.cacheOwner singleflight.Group`
- singleflight key 与 cache key 一致
- singleflight 只去重并发抓取，不改变 TTL 语义

---

## 7. Route Behavior

### 7.1 Show Page

show page 的目标是更快首屏。

推荐：

- show page 请求 feed route 时传 `limit=20` 或 `limit=30`
- 后端如果命中完整 `ParsedFeed` cache，则直接切片返回前 N 条
- miss 时抓完整 feed，解析完整 payload，若准入则入 cache，然后返回前 N 条

### 7.2 Episodes Page (`See all`)

episodes page 不应再走“全量一次拿完”或“固定 100 条截断”。

最终收敛要求：

- 首屏请求：`limit=20&offset=0`
- 向下滚动到底部时继续请求：
  - `limit=20&offset=20`
  - `limit=20&offset=40`
  - ...
- 前端将后续页 append 到现有列表底部
- 底部显示 loading spinner

如果是从 show page 进入：

- 理想路径应直接命中同一个完整 `ParsedFeed` cache
- 避免二次抓取同一个 `feedUrl`
- 即使前端请求的是分页窗口，后端也只是在完整缓存 payload 上做切片

### 7.3 Important Constraint

后续实现已经证明：只做 `limit`，但不给 `See all` 真分页，会直接造成产品回归。

必须避免两种错误实现：

- `See all` 只拿前 20 条，没有继续加载能力
- `See all` 固定只拿前 100 条，但没有 pagination / load more

因此这里的最终约束更新为：

- show page 可以只拿第一页
- episodes page 必须是真正的增量分页
- 不能把 `See all` 语义偷偷降级成“最近 N 条”

### 7.4 Backward-Compatible Rollout

第一阶段后端必须支持 `limit`，但不要求前端在同一任务里立刻改为传 `limit`。

换句话说：

- 后端 contract 可以前向扩展
- feed cache 本身必须独立成立

后续实际落地后，这条已不再适用。

最终记录：

- 前端必须一起落地分页 contract
- 否则只改后端 `limit` 没有用户价值
- 仅有“后端支持 limit，前端不传”的状态是不完整交付

---

## 8. Post-Implementation Corrections

这部分记录 027 在后续真实落地中，新增确认过的约束和修正点。

### 8.1 Singleflight Context Ownership

实际实现中曾出现一个严重回归：

- feed cache miss 的 singleflight fetch 使用了“第一个请求”的 `ctx`
- 如果 leader request 被取消或超时
- 同一 singleflight 上的 follower 也会一起失败

这不符合工程要求。

最终约束：

- shared upstream fetch 必须使用 backend-owned detached context
- 这个 context 应来自 `context.Background()` + service timeout
- 不能绑在首个 caller 的 request context 上
- 每个 caller 自己等待结果时，仍然要受自己的 request context 约束

正确语义：

- leader 取消，不应杀掉 follower 的共享抓取
- follower 取消，只应停止自己等待，不应取消共享抓取

### 8.2 Show Page Contract

show page 的最终 contract 固定为：

- 请求 feed route：`limit=20&offset=0`
- 目的：降低首屏 payload、JSON 序列化和前端 parse 成本

这不是“建议”，而是后续实现确认过的有效 contract。

### 8.3 Episodes Page Contract

episodes page (`See all`) 的最终 contract 为：

- 前端使用真正的增量分页
- 请求参数：
  - 第一页：`limit=20&offset=0`
  - 第二页：`limit=20&offset=20`
  - 第三页：`limit=20&offset=40`
- 列表向下滚动到底部时触发 `fetchNextPage`
- 底部展示 loading spinner

后端职责：

- 上游仍然抓取并解析完整 feed
- cache 中存完整 `ParsedFeed`
- 对外响应根据 `limit + offset` 只切当前窗口

补充一个已确认的前端交互约束：

- 如果 show page 已经把第一页 `limit=20&offset=0` 放进 query cache
- 进入 `See all` 时必须直接复用这第一页
- 不得再次重复请求 `offset=0`

同时，必须避免另一个回归：

- `See all` 在初始渲染阶段，即使虚拟列表组件错误地提前触发了 `endReached`
- 也不得立刻请求第二页

最终正确语义：

- 首屏进入 `See all`：
  - 只显示第一页 20 条
  - 不自动变成 40 条
- 只有用户发生真实滚动交互后
  - 到达底部时才允许请求 `offset=20`
  - 然后再 append 第二页

一句话总结：

- 第一页复用是必须的
- 第二页加载必须由真实用户滚动触发，不能由首屏渲染隐式触发

### 8.4 Deep Link Resolution Must Stay Full-Feed

后续实现时还暴露过另一个回归：

- `useEpisodeResolution` 被错误改成只看前 100 条 feed entries
- 导致老单集 deep link 无法解析

最终约束：

- route resolution / deep link resolution 不能复用 `See all` 的分页窗口语义
- `useEpisodeResolution` 必须保持 full-feed fallback 语义
- 不能因为 show/episodes page 做了分页，就把 deep-link resolution 也截断成最近 N 条

一句话总结：

- 页面列表可以分页
- 单集解析不能丢失全量可解析能力

### 8.5 PageInfo Contract For Precise Pagination Stop

后续实现中还出现过一个“小冗余”：

- 前端只靠 `returned < pageSize` 判断是否还有下一页
- 当总集数刚好是 `20` 的整数倍时
- 会额外多打一页空请求来确认结束

这不影响正确性，但属于不必要的请求。

最终修正方案：

- feed 分页响应增加 `pageInfo`

建议结构：

```go
type parsedFeedPageInfo struct {
  Limit    int  `json:"limit"`
  Offset   int  `json:"offset"`
  Returned int  `json:"returned"`
  HasMore  bool `json:"hasMore"`
}
```

并将其挂在响应上：

```go
type parsedFeedResponse struct {
  Title       string                    `json:"title"`
  Description string                    `json:"description"`
  ArtworkURL  string                    `json:"artworkUrl,omitempty"`
  PageInfo    *parsedFeedPageInfo       `json:"pageInfo,omitempty"`
  Episodes    []parsedFeedEpisodeResult `json:"episodes"`
}
```

分页停止语义最终应为：

- 优先使用后端返回的 `pageInfo.hasMore`
- 只有在旧响应没有 `pageInfo` 时，前端才允许回退到：
  - `returned < pageSize` => no more

这样可以避免：

- 总量刚好为 `20/40/60/...` 时多打一页空请求

---

## 9. Final Recorded Outcome

027 最终不是只落成一个“小内存 TTL cache”。

它最终演化为一套完整约定：

- 后端：
  - 完整抓取并解析 feed
  - 小内存短 TTL cache
  - singleflight 去重并发 miss
  - shared fetch 使用 backend-owned context
  - 响应支持 `limit + offset`
  - 分页响应带 `pageInfo.hasMore`
- 前端：
  - show page 固定拿第一页 `20`
  - episodes page 使用 infinite pagination
  - 向下滚动到底部继续 append
  - deep link resolution 保持 full-feed fallback

最终目标不是“只缓存 feed”，而是：

- 用完整 feed cache 承担后端重活
- 用分页窗口改善 show / see all 的前端体验
- 同时不牺牲 episode route 的正确解析能力
- 是否立刻让 show page / episodes page 传不同 `limit`，可以作为同任务内的可选跟进，但不是 cache 生效的前置条件

---

## 8. API Contract Suggestion

为 `/api/v1/discovery/feed` 增加可选参数：

- `limit`

可暂不加入 `offset`。

第一阶段建议：

- show page 用 `limit`
- episodes page 可以继续请求较大数量，或者暂时保持全量，视产品决定

参数约束要求明确：

- `limit` 缺省时保持当前行为
- `limit <= 0` 视为无效参数，返回参数错误
- `limit` 提供时仅要求为正整数；本阶段不额外引入 feed route 专用 max cap
- 最终响应返回 `min(limit, len(payload.Episodes))`
- `limit` 只对最终响应做切片
- cache 中保存的必须始终是完整解析后的 feed payload

如果未来要做 `offset`：

- 只能在“完整 `ParsedFeed` 已缓存”前提下才有真正复用意义
- 否则每次翻页仍会重新抓取整个 feed

---

## 9. Implementation Constraints

### 9.1 Must

- 缓存层必须是“可选性能优化”，不能改变正确性
- cache miss / eviction / TTL expiry 时，行为必须退化为当前逻辑
- 不得因为 cache 写入失败而让 feed 请求失败
- TTL 过期后必须视为 miss 并重新抓取；不得返回 stale feed 作为 graceful degradation

### 9.2 Must Not

- 不得把 feed cache 当成长期存储
- 不得缓存原始 XML
- 不得无上限增长
- 不得为了 cache 命中而返回明显过期太久的数据

### 9.3 Operational Safety

- 默认配置要保守
- 所有阈值要可配置
- 即使误配置，也不能无限吃内存
- cache admission 与 eviction 的失败不得影响主请求成功返回
- 序列化字节数估算允许保守，只要不会低估明显的大 payload

---

## 10. Recommended Config

建议新增类似配置：

- `READIO_DISCOVERY_FEED_CACHE_TTL_MS`
- `READIO_DISCOVERY_FEED_CACHE_MAX_ENTRIES`
- `READIO_DISCOVERY_FEED_CACHE_MAX_EPISODES`
- `READIO_DISCOVERY_FEED_CACHE_MAX_BYTES`

推荐默认值：

- TTL: `300000` ms
- Max entries: `12`
- Max episodes per cached feed: `300`
- Max serialized bytes per cached feed: `1048576`

解析要求：

- TTL `<= 0` 时视为禁用 feed cache
- Max entries `<= 0` 时视为禁用 feed cache
- episodes / bytes 阈值 `<= 0` 时视为禁止任何 entry 写入 cache
- 配置解析失败时回退到安全默认值

---

## 11. Validation

### Automated

至少覆盖：

1. cache miss 时会抓上游并返回结果
2. 相同 normalized feed URL 的第二次请求命中 cache
3. TTL 过期后重新抓上游
4. 超大 feed 不进入 cache
5. eviction 后再次请求会重新抓上游
6. `limit` 切片只影响响应，不影响 cache 中保存的完整 payload
7. query / fragment / host case / 默认端口 normalization 命中同一个 cache key
8. 并发 miss 只触发一次上游抓取
9. feed cache 禁用时行为退化为当前逻辑

### Manual

至少验证：

1. 进入 show page 首次加载正常
2. 从 show page 点 `See all`，短时间内不应再次明显等待同一个 feed
3. 切换其他节目后再回来，命中/淘汰行为符合预期
4. 大节目不会导致进程内存异常上涨

---

## 12. Acceptance Criteria

- feed cache 只作为短期性能层存在，不承担长期存储职责
- 同一 feed 在短时间内被 show page 与 episodes page 复用时，明显减少重复抓取
- 1GB VPS 下默认配置安全，不会形成无上限内存增长
- cache miss / TTL expiry / eviction 不会影响功能正确性
- 前端不需要感知 cache 存在
- feed route 的 `limit` 不会污染 cache key，也不会导致 cache 中只保存部分 episodes
- feed cache 不返回 stale entry；过期后直接重新抓取

---

## 13. Status

当前是方案文档，不代表已实现。

推荐执行顺序：

1. 先实现小内存 TTL cache
2. 再评估 show page 是否单独加 `limit`
3. 暂不引入磁盘 cache

---

## 14. Implementation Notes For Execution

为了避免实现偏差，执行时应遵守以下约束：

1. 新 feed cache 应与现有 `discoveryCache` 分离
   - 原因：现有 cache 带 stale fallback 语义，不符合本任务
2. cache key 必须只依赖 normalized feed URL
   - 该 normalized URL 必须基于已成功通过现有 feed URL 校验链路的绝对 `http/https` URL 生成
   - normalization 不能成为比当前 `fetchFeed` URL 校验更宽松的新入口
3. byte size 估算建议使用 `json.Marshal(payload)` 后的长度
4. changed-zone 文档至少同步：
   - `apps/docs/content/docs/apps/cloud/deployment.mdx`
   - `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
   - `apps/docs/content/docs/apps/cloud/handoff/features/discovery.mdx`
   - `apps/docs/content/docs/apps/cloud/handoff/features/discovery.zh.mdx`
     - 补充新的 feed cache env keys 与 backend cache model
5. required changed-zone code review anchors：
   - `apps/cloud-api/discovery_feed.go`
   - `apps/cloud-api/discovery.go`
   - 新增或修改的 feed cache tests
6. observability 预期：
   - fresh hit -> `fresh_hit`
   - miss + upstream fetch + cache write -> `refreshed`
   - cache disabled / admission reject -> `uncached`
