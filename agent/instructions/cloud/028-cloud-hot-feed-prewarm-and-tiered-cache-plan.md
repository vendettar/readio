# Instruction 028: Cloud Hot Feed Prewarm And Tiered Cache Plan

## 1. Goal

为 Explore 首页的高频节目建立一套“热点 feed 预热 + 分层 TTL + 可选磁盘快照”的缓存方案，用于进一步改善以下场景的首开速度：

- Explore 首页进入节目详情页
- Explore 首页点击 `See all`
- 多用户、多设备短时间内重复访问同一批热门节目

这份方案是 027 的上层增强：

- 027 解决“通用 feed 请求如何在后端短期复用”
- 028 解决“固定热点 feed 如何在用户访问前就处于可命中状态”

---

## 2. Decision

采用三层设计：

- L1: 现有进程内短 TTL feed cache
- L2: 热点 feed 异步预热池
- L3: 可选磁盘 JSON 快照，仅用于固定热点集合的 cold start 加速

明确不采用：

- 服务启动时同步阻塞式预热
- 对所有 feed 一视同仁地做长 TTL
- 对 search 结果做磁盘持久化 feed cache
- 原始 XML 磁盘缓存
- 把磁盘快照当作长期业务真相

---

## 3. Why This Plan

### 3.1 热点集合和普通集合的访问特征不同

Explore 首页的部分节目具有明显热点属性：

- Editor's Pick 前 10
- Top Show 前 10

这些节目的特征是：

- 访问频率高
- 集合规模小
- 在一个时间窗口内相对稳定
- 值得付出更高缓存成本

而普通集合：

- search 结果
- top 10 之外的节目
- detail page 上偶发访问的节目

访问分布更长尾，不值得一开始就做重缓存和预热。

### 3.2 单靠 027 还不够

027 已经解决：

- A 用户访问后，B 用户也可命中同一份服务端 feed cache
- show page 和 `See all` 可共享完整 feed payload

但 027 仍然是“请求驱动型”：

- 第一次请求仍然需要真实抓上游 feed

对于 Explore 首页固定热点节目，更理想的行为是：

- 用户第一次点进去之前
- 这批节目的 feed 已经在后端准备好

### 3.3 为什么热点集合值得考虑磁盘快照

对极小而固定的热点集合来说：

- 进程重启后的 cold start 仍然是明显成本
- 本地磁盘读取解析后的 JSON，通常比再次走外网 RSS 快

所以：

- 热点集合可以考虑磁盘快照
- 但只应该作为 cold start 加速层
- 不能演化成“所有 feed 的持久层”

---

## 4. Scope

### In Scope

- Explore 首页固定热点集合的 feed 预热
- 热点与普通 feed 的分层 TTL 策略
- 热点 feed 的可选磁盘 JSON 快照
- 仅缓存解析后的 `ParsedFeed`
- 仅针对已知热点节目集合

### Out of Scope

- 全量 feed 持久化
- search 结果 feed 预热
- 原始 XML 持久化
- Redis / 分布式缓存
- 多实例跨节点共享热点 feed

---

## 5. Hot Feed Definition

第一阶段建议只覆盖：

- Editor's Pick 前 10 个节目
- Top Show 前 10 个节目

不建议一开始就覆盖：

- Top Episode 对应节目
- search 结果节目
- Top Show 前 10 之外的节目

原因：

- Editor's Pick / Top Show 都是首页固定强曝光入口
- 数量可控
- 命中率高
- 更容易评估收益

---

## 6. Architecture

### 6.1 L1: Generic In-Memory Feed Cache

继续保留 027 的现有通用 feed cache：

- 完整 `ParsedFeed`
- 小内存
- 短 TTL
- 受 `maxEntries / maxEpisodes / maxBytes` 保护

这层仍然服务所有 feed 请求。

### 6.2 L2: Hot Feed Prewarm Layer

新增一个“热点 feed 预热池”概念：

- 不改变外部 API contract
- 本质仍然是提前把热点 feed 写入 L1
- 只是在后台周期性刷新热点集合

推荐方式：

- 服务启动后异步触发
- 周期性 refresh
- 不阻塞主服务启动
- 单个热点 feed 失败不影响整体服务

### 6.3 L3: Optional Disk Snapshot Layer

可选增加一层热点 feed 磁盘快照：

- 存储内容：解析后的 `ParsedFeed` JSON
- 只覆盖热点集合
- 只作为 cold start 加速

推荐语义：

- 进程启动时先尝试从磁盘加载热点快照进入内存
- 然后后台继续异步 refresh 上游 feed
- 如果 refresh 成功，则更新内存并回写快照

必须明确：

- 磁盘快照不是 authoritative source
- TTL 过期后仍应依赖上游 refresh
- 快照损坏时可直接丢弃，不影响服务可用性

---

## 7. TTL Strategy

### 7.1 Tiered TTL

建议至少分两档：

- Hot feed:
  - 30 min 到 2 h
- Normal feed:
  - 继续维持 027 的短 TTL，例如 5 min

不建议：

- 把热点 TTL 设得过长，例如 24h

原因：

- 新闻类 podcast 更新很快
- 热门节目通常恰好也是更新更频繁的节目

### 7.2 Different Policy By Feed Class

推荐：

- Hot feed:
  - 更长 TTL
  - 后台 refresh
  - 可选磁盘快照
- Normal feed:
  - 请求触发
  - 短 TTL
  - 不做磁盘快照

这比“一套 TTL 覆盖所有 feed”更合理。

---

## 8. Prewarm Trigger Strategy

### 8.1 Do Not Block Service Startup

不允许：

- 服务启动时同步抓取全部热点 feed，完成后才 `ListenAndServe`

正确做法：

- server ready 之后异步启动 prewarm worker
- 首轮 prewarm 在后台执行
- 单个 feed 超时/失败只记日志，不影响主服务

### 8.2 Refresh Sources

热点 feed 列表来源建议来自 Explore 首页当前 authoritative 数据：

- Editor's Pick 列表
- Top Show 列表

推荐流程：

1. 获取首页热点节目列表
2. 解析得到各自 canonical `feedUrl`
3. 对 feedUrl 去重
4. 对去重后的 feedUrl 做预热

### 8.3 Refresh Frequency

第一阶段建议：

- 服务启动后立即异步 prewarm 一轮
- 然后每 15 min 或 30 min 执行一次 refresh

不建议太频繁：

- 否则会主动增加上游 RSS 压力

---

## 9. Disk Snapshot Design

### 9.1 What To Store

只存：

- 热点 feed 的 canonical normalized feed URL
- 对应的解析后 `ParsedFeed`
- snapshot metadata

建议结构：

```go
type hotFeedSnapshot struct {
  FeedURL     string             `json:"feedUrl"`
  CachedAt    time.Time          `json:"cachedAt"`
  ExpiresAt   time.Time          `json:"expiresAt"`
  Payload     parsedFeedResponse `json:"payload"`
}
```

### 9.2 What Not To Store

不存：

- 原始 XML
- 全量普通 feed
- 任意 search 结果 feed
- 无界历史版本

### 9.3 File Layout

建议只保留一个小而明确的目录，例如：

- `data/feed-cache/hot/`

文件命名可以基于 normalized feed URL 的稳定 hash。

### 9.4 Safety Requirements

- 写入要原子替换
- 读失败或 JSON decode 失败时，直接丢弃该快照
- 不允许因为快照损坏而让请求失败

---

## 10. Best-Practice Rollout

推荐分三步：

### Step 1

先做：

- 热点 feed 异步预热
- 更长 TTL

先不做磁盘快照。

### Step 2

观察：

- 热点命中率
- cold start 是否仍然明显慢
- 内存使用是否稳定

### Step 3

如果 cold start 仍是明显问题，再加：

- 热点 feed 磁盘 JSON 快照

这样改动最稳，也最容易回滚。

---

## 11. Acceptance Criteria

- Explore 首页的固定热点节目首次点击速度明显改善
- 多用户、多设备访问同一热点 feed 时更稳定命中服务端缓存
- 热点 feed 预热失败不会阻塞服务启动
- 长 TTL 只作用于热点 feed，不污染普通 feed 路径
- 即使引入磁盘快照，也不会把磁盘层变成长期真相源

---

## 12. Recommendation

结论：

- 方案合理
- 技术上可行
- 但最优解不是“全部 feed 启动预热 + 全量磁盘缓存”

最优路线是：

1. 通用 feed 继续走 027
2. 首页固定热点集合单独做异步预热
3. 热点 feed 使用更长 TTL
4. 只有在确实需要改善 cold start 时，再给热点集合增加磁盘 JSON 快照

一句话总结：

- 027 负责通用复用
- 028 负责热点前置加速
