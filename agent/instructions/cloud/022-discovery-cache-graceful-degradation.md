# Instruction 022: Discovery Cache Graceful Degradation

> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.

# Task: 实现 Discovery 缓存的 Graceful Degradation

## 背景

当前 Cloud API 的 Discovery 路由在缓存过期后会直接请求上游；如果刷新失败，就直接返回错误。  
这会让用户在上游短时故障、网络波动、限流等情况下失去整个 Discovery 面。

原始 Lite 的行为不是这样。原始逻辑是：

1. fresh cache 命中：直接返回
2. cache 过期：尝试刷新
3. 刷新失败：如果存在旧缓存，则继续返回旧缓存

也就是典型的：

- `fresh if possible`
- `stale on upstream failure`
- `error only when no usable cache exists`

## 原始代码参考

位置：`local/original/scripts/modules/galleryRemote.js:861-900`

```javascript
const run = (async () => {
  const local = this.readAppleChartCache(c, limit)
  const fresh = local && Date.now() - local.at <= APPLE_CHART_CACHE_TTL_MS ? local.entries : null
  if (fresh) {
    return fresh
  }

  const stale = local && Array.isArray(local.entries) ? local.entries : null
  try {
    const data = await this.fetchJsonWithProxy(url, { signal })
    // ...处理新数据...
    return normalized
  } catch (error) {
    if (stale) {
      return stale
    }
    throw error
  }
})()
```

## 当前问题

1. Discovery TTL 只有 30 分钟，不一致于原始 24 小时策略
2. 过期后刷新失败会直接报错
3. 过期缓存没有保留成 stale fallback
4. 合同层没有明确：
   - 什么叫 fresh
   - 什么叫 stale
   - 哪些错误允许 stale fallback
   - 哪些错误不该被 stale fallback 静默掩盖

## 目标

1. **延长 TTL**
   - Discovery 缓存 TTL 从 `30m` 改为 `24h`
2. **实现 Graceful Degradation**
   - fresh 命中直接返回
   - 过期后尝试刷新
   - 刷新失败时，如果存在 stale cache，则返回 stale cache
   - 即使 stale 已经过期很久，仍可作为 fallback 使用
3. **保持 API 兼容**
   - JSON response shape 不变
   - 调用方不需要因为这次变更改解析逻辑
4. **补足 observability**
   - 必须能区分 fresh hit / stale fallback / cache miss error

## Implementation order

必须按以下顺序执行：

1. 先新增 failing tests，锁定当前不满足 graceful degradation 的行为
2. 再抽共享 cache helper / owner
3. 再把所有相关 discovery route 接到同一 contract
4. 最后再做 docs / handoff 同步

不要先改实现再补测试。

## 适用范围

本次只处理 Cloud API Discovery server-side 内存缓存。

影响的路由至少包括：

- `/api/v1/discovery/top-podcasts`
- `/api/v1/discovery/top-episodes`
- `/api/v1/discovery/lookup/podcast`
- `/api/v1/discovery/lookup/podcast-episodes`

如果当前实现还有其他复用同一 discovery cache contract 的 route，一并纳入；不要做只修一半的局部行为。

## 非目标

本次不做：

1. 引入 Redis / 持久化缓存
2. 改前端 TanStack Query staleTime / retry 策略
3. 改 response schema
4. 改视觉 UI、错误页 copy、空状态布局
5. 做 “stale while revalidate in background” 前端协议扩展
6. 无限扩展到 proxy / ASR / media fallback 等其他系统

## 核心合同

### 1. Cache 状态定义

对任意 discovery key，缓存状态必须明确分成三类：

1. `fresh`
   - entry 存在
   - `now <= expiresAt`
   - 可直接返回

2. `stale`
   - entry 存在
   - `now > expiresAt`
   - 不可直接视为 fresh
   - 但在上游刷新失败时，可作为 fallback 返回

3. `miss`
   - entry 不存在
   - 没有任何可用缓存

### 2. Graceful degradation 规则

#### 情况 A：fresh hit
- 直接返回 fresh
- 不触发上游请求

#### 情况 B：stale hit + refresh success
- 返回 freshened result
- 覆盖旧缓存

#### 情况 C：stale hit + refresh failure
- 返回 stale
- 不把用户路径打成 hard failure

#### 情况 D：cache miss + refresh failure
- 返回错误
- 因为没有任何可回退数据

### 3. 允许 stale fallback 的错误类型

stale fallback 的目标是掩盖 **上游可恢复失败**，不是吞掉所有内部 bug。

优先允许 stale fallback 的失败：

1. upstream network failure
2. timeout
3. upstream non-2xx / temporary unavailability
4. rate limit / transient provider-side instability

补充约束：

- stale fallback 只适用于 **refresh 阶段失败**
- fresh 命中不应触发 refresh
- miss 状态也不应伪造 stale fallback

### 4. 不应静默 stale fallback 掩盖的失败

以下类型默认不应被“无脑 stale fallback”吞掉，除非你有非常明确的理由并在 reviewer notes 中写清：

1. 本地代码 bug
   - nil dereference
   - internal invariant break
   - programmer error

2. normalize / decode contract bug
   - 本地解析逻辑已经坏掉
   - schema mapping 自己写错

原因：如果把这类错误全部 silent-fallback 掩盖，系统会长期靠旧缓存运行，反而隐藏真实回归。

更具体地说：

- **upstream fetch failed before usable payload arrives**: 可以 stale fallback
- **upstream payload arrived, but our normalize/decode code crashes due to our own bug**: 默认不应静默 stale fallback

如果当前实现很难精确区分，请至少先做到：
- 网络/超时/上游状态错误 -> stale fallback
- 其他内部错误 -> 保持显式错误

### 5. First-pass error boundary

为了避免实现漂移，first-pass 必须按如下边界区分：

1. **可 stale fallback**
   - upstream request 根本未成功完成
   - timeout
   - transport/network failure
   - upstream 4xx/5xx（按你当前 discovery contract 认为是可恢复失败时）

2. **默认不可 stale fallback**
   - upstream payload 已返回，但本地 decode / normalize / mapping 崩溃
   - 本地 invariant break
   - programmer error

换句话说：

- `fetch failed before usable payload` -> 可以 stale fallback
- `payload arrived but our code failed to process it` -> 默认 hard error

## 实现要求

### 1. TTL 改为 24 小时

在 `apps/cloud-api/discovery.go` 或其实际 owner 文件中，将 discovery cache TTL 调整为：

```go
24 * time.Hour
```

不要只改一条路径；所有共享该 discovery contract 的 endpoint 必须一致。

### 2. Cache entry 不能在过期时物理丢弃

要实现 stale fallback，缓存结构不能在 TTL 一到就把 entry 删除。

也就是说，cache 至少要保留：

```go
type discoveryCacheEntry struct {
    data      any
    expiresAt time.Time
}
```

并由读取方判断它是 `fresh` 还是 `stale`。

### 3. 读取 API 必须能表达 fresh/stale/miss

不要只保留一个：

```go
get(key) (any, bool)
```

这种 API 无法区分：
- fresh
- stale
- miss

建议至少演进成类似：

```go
type discoveryCacheLookup struct {
    data      any
    found     bool
    fresh     bool
    expiresAt time.Time
}
```

或任何等价的表达方式。

### 4. 刷新逻辑必须单点 owner

不要在每个 route handler 里各写一套：

- 读缓存
- 判断过期
- try refresh
- stale fallback

应该抽到一个共享的 discovery cache helper / owner 内，保证所有 route 语义一致。

### 5. 并发请求必须避免放大上游刷新

如果多个请求同时命中同一个 stale key，不应并发打爆同一个 upstream。

要求：

1. 同一个 cache key 的并发 refresh 应尽量合并
2. 最少要避免明显的 refresh stampede

实现方式可以是：

- `singleflight.Group`
- 或等价的 per-key in-flight dedupe

不要求这次做复杂 distributed locking，但至少要有单进程内的并发收敛。

### 6. Bounded cache invariant must remain true

引入 stale fallback 后，不得破坏当前 discovery in-memory cache 的有界性。

要求：

1. stale entry 可以在逻辑上保留为 fallback 候选
2. 但整体缓存仍必须受现有 `maxKeys` / eviction contract 约束
3. 不允许因为 “stale 也要保留” 就把 cache 变成无限增长

## 返回与可观测性合同

### 1. Response shape 不变

即使返回 stale fallback，用户看到的 JSON shape 也不能变。

不要新增这类破坏兼容的字段：

- `isStale`
- `fallback`
- `degraded`

除非你明确同步了整个 API contract 和调用方。本次默认不允许这么扩。

### 2. Observability 必须能区分路径

虽然 response shape 不变，但日志/metrics 必须能区分至少这三种状态：

- `fresh_hit`
- `refreshed`
- `stale_fallback`
- `miss_error`

你可以用等价的低基数字段名，例如：

- `cache_status`
- `discovery_cache_result`

要求：

1. 低基数
2. 不能把动态 key 直接打进 metrics label
3. 便于后续在 admin/summary 中判断降级是否发生

建议补充低成本字段：

- `cache_age_ms`
- 或 `stale_age_ms`

它们应作为日志字段存在，而不是 response 字段；
不要求进入高基数 metrics label。

## 推荐实现方向

下面是允许的方向，不是逐字实现要求：

```go
func (s *discoveryService) getWithGracefulDegradation(
    key string,
    ttl time.Duration,
    fetch func() (any, error),
) (data any, cacheStatus string, err error) {
    entry, state := s.cache.lookup(key)

    if state == fresh {
        return entry.data, "fresh_hit", nil
    }

    refreshed, fetchErr := s.fetchSingleflight(key, fetch)
    if fetchErr == nil {
        s.cache.set(key, refreshed, ttl)
        return refreshed, "refreshed", nil
    }

    if state == stale {
        return entry.data, "stale_fallback", nil
    }

    return nil, "miss_error", fetchErr
}
```

重点不是这段代码本身，而是这些合同：

1. fresh 直返
2. stale 失败可回退
3. miss 失败报错
4. cache 状态被显式记录

## 测试要求

必须新增/更新自动化测试，至少覆盖：

1. fresh hit
   - 命中未过期缓存
   - 不触发 upstream fetch

2. stale hit + refresh success
   - 返回新数据
   - 缓存被更新

3. stale hit + refresh failure
   - 返回 stale 数据
   - 不返回 hard error

4. miss + refresh failure
   - 返回错误
   - 不伪造空成功

5. TTL = 24h
   - 行为与原先 30m 不同被锁定

6. 并发 stale refresh
   - 同一 key 下并发请求不会重复触发大量 upstream fetch

7. observability
   - 至少断言日志/summary 使用了低基数 cache status

8. decode/normalize hard error
   - stale hit + payload returned + local decode/normalize failure
   - 默认不走 stale fallback
   - 保持显式错误

## Review Focus

Reviewer 必须重点检查：

1. 是否真的保留了 stale entry，而不是 TTL 一到就删
2. stale fallback 是否只用于合适的 upstream failure
3. 是否把 normalize/decode 自己的 bug 也静默吞掉
4. 是否在单一 owner 中实现，而不是多个 route 各自复制逻辑
5. TTL 是否对所有相关 discovery route 一致
6. 并发 stale refresh 是否有去重/收敛
7. response shape 是否保持兼容

## 验证

- [ ] Discovery cache TTL 已统一为 24 小时
- [ ] fresh hit 不触发上游请求
- [ ] stale hit + refresh success 会更新缓存
- [ ] stale hit + refresh failure 返回 stale，不报错
- [ ] miss + refresh failure 返回错误
- [ ] 并发 stale refresh 不会明显放大 upstream 请求
- [ ] observability 能区分 `fresh_hit` / `refreshed` / `stale_fallback` / `miss_error`
- [ ] decode/normalize 本地错误默认不会被 stale fallback 静默掩盖

---

## Documentation
- Update `apps/docs/content/docs/general/technical-roadmap.mdx` after Reviewer sign-off
- Update Cloud handoff / runtime docs if discovery caching behavior is described there
- If deployment / operator docs mention discovery cache semantics, sync:
  - 24h TTL
  - stale fallback behavior
  - observability field naming

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-04-08
- **Reviewed by**:
