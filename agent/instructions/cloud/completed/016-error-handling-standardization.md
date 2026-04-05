# Instruction 016: Cloud 错误处理与日志标准化

# Task: 完善 Cloud 版本错误处理、错误码与文档体系

## 问题背景

当前 Cloud 版本的错误处理存在以下问题：

1. **前端生产日志缺失或不稳定**
   - `logger.ts` 中 `log()`、`info()`、`warn()` 在生产环境默认不输出
   - 只有 `error()` / `logError()` 会稳定输出
   - 一些 operator-relevant 的关键失败仍使用 `log()`，生产环境不可见

2. **后端错误响应 contract 不统一**
   - 不同模块的错误字段和命名不一致
   - `error_class` 与对外错误码语义混杂
   - 难以稳定排查与跨模块聚合

3. **错误码文档缺失**
   - 没有 Cloud 错误码索引页
   - operator / reviewer 无法快速定位 code、HTTP 状态和处理建议

4. **日志脱敏 contract 不明确**
   - 如果直接扩大日志覆盖面，可能把 token / secret / query 参数等敏感值打进控制台或后端日志

## 当前状态

### 后端（Cloud API）
- ASR relay 已有部分错误码语义（如 `payload_too_large`, `rate_limited`, `unauthorized`）
- Discovery / Proxy / Admin observability 已有 `error_class` 与 canonical request logging 基础
- 但 **对外错误码、响应 shape、文档** 尚未标准化

### 前端（Cloud UI）
- `ASRClientError` 已包含 code 概念
- `logError()` 在生产环境可见
- 但部分关键路径仍使用不会在生产环境稳定输出的日志接口

## 目标

1. **统一 Cloud API 错误响应 contract**
2. **统一高价值 Cloud surface 的稳定 `code` 命名**
3. **明确 `error_class` 与 `code` 的职责边界**
4. **前端关键 operator-debug 路径在生产环境可见**
5. **建立 Cloud 错误码文档**
6. **在整个改动中坚持脱敏日志 contract**
7. **统一前端 route/root/component/domain 错误分层 owner**
8. **确保生产 UI 不暴露 raw exception text / stack traces**

## 核心 contract

### 1. 区分 `error_class` 与 `code`

必须明确：

- `error_class`
  - 用于 observability / metrics / summary 聚合
  - 应保持低基数、稳定、适合分桶
  - 例如：`timeout`, `rate_limit`, `unauthorized`, `upstream`, `invalid_request`

- `code`
  - 用于 API 错误响应、前端逻辑、operator 排查文档
  - 应为稳定、精确、可文档化的错误码
  - 例如：`ASR_PAYLOAD_TOO_LARGE`, `DISCOVERY_FEED_TIMEOUT`, `PROXY_INVALID_RANGE`

这两者不得混用或互相替代。

### 2. Cloud API 错误响应 shape

first-pass standardization must require a stable JSON error shape for the Cloud API surfaces touched by this task.

至少应稳定包含：

- `code`: machine-readable stable error code
- `message`: operator-readable safe message
- `request_id`: **first-pass 必须实现** — 使用低成本方案（如 `time.Now().UnixNano()` 的 hex 表示）在每个请求进入时生成，注入错误响应 JSON 和 `slog` 上下文。不要依赖外部 infra。
- optional `details`: only for safe, non-secret supplemental debugging fields

所有错误响应必须设置 `Content-Type: application/json; charset=utf-8`，与 discovery 现有行为一致。

如果某些现有 route 暂时无法统一到完整 shape，instruction 必须要求实现者明确记录差异与原因。

### 3. 前端错误分层 owner

本次 standardization 必须明确 Cloud UI 至少存在以下四层错误 owner：

- `route-level`
  - 由 router `defaultErrorComponent` / route `errorComponent` 负责
  - 处理 route render / loader / route-scoped crash
- `root-level`
  - 由 `RootErrorBoundary` 负责
  - 处理 router 之外或更高层的 React tree crash
- `component-level`
  - 由局部 `ComponentErrorBoundary` 负责
  - 目标是局部隔离，而不是升级成整页 crash
- `domain/async-level`
  - 对可恢复业务失败使用页面内 error state / retry / toast / fallback UI
  - 不应把所有业务失败都 throw 到 route/root boundary

本任务触达的前端 changed zone，必须按以上 owner 重新审视错误归属。

### 4. 生产 UI 错误暴露 contract

生产环境必须遵守：

- 不在 UI 中渲染 raw exception text
- 不在 UI 中渲染 stack traces
- route/root fallback UI 只允许显示：
  - safe generic title
  - safe generic description
  - retry / reload / navigation actions
  - optional non-sensitive incident or request identifier（仅在 current infra 已存在或可低成本附加时）
- 详细诊断信息仅保留在：
  - dev mode
  - operator-only logs
  - docs / internal debugging surfaces

### 5. 日志脱敏 contract

扩大错误日志覆盖面时，必须遵守以下规则：

- 不记录 API keys、Bearer tokens、shared secrets、admin token
- 不记录完整 `Authorization` header
- 不记录完整 multipart body / 音频二进制 / transcript 原文 payload
- 对带敏感 query 参数的 URL 做脱敏或截断
- 错误日志允许记录 route、code、status、provider、host、size bucket、elapsed_ms 等安全维度

### 6. 前端生产日志 contract

不要把"所有失败"都改成 `logError()`。

只对以下失败使用生产可见的错误日志：

- operator-relevant
- production-debuggable
- user-facing critical failure
- terminal failure（而不是预期重试中间态）

以下情况通常不应升级为 `logError()`：

- 用户主动取消
- retry 中间态
- 已知 fallback 将继续接管的瞬时失败
- 预期 EOF / aborted / transient state noise

**AbortError 排除规则**：所有新加或修改的 `logError()` 调用前，必须先排除 `AbortError`。`fetchUtils.ts` 已有 `isAbortLikeError()` 工具，应复用。用户切歌、取消请求、页面导航中断等场景产生的 `AbortError` 不得升级为 `logError()`。

**现有 `logError` 误用 audit**：本次 first-pass 必须审计以下文件中现有的 `logError` 调用，将不符合上述 contract 的降级为 `warn()` 或 `log()`：
- `exploreStore.ts`（13 处 `logError`，包括 search failed、load subscriptions failed 等预期会被 fallback 接管的中间态）
- `playerStore.ts`（10 处 `logError`，包括 save progress failed 等 domain-level 非 terminal 失败）
- `useSettingsForm.ts`（4 处 `logError`，credential load/save 失败等用户操作级错误）
- `filesStore.ts`（14 处 `logError`，folder/track load 失败等 UI 级错误）
- `historyStore.ts`（4 处 `logError`，session load 失败等 UI 级错误）

降级判断标准：如果该失败有 fallback UI（toast、inline error state、retry button）且不影响核心功能，应降级为 `warn()`。

### 7. `code` / `message` / `details` 的边界

必须明确：

- `code`
  - 是 surface-stable、可文档化的错误码
  - 不能把内部函数名、第三方原始错误字符串、行号、实现细节编码进 `code`
  - 不要为每个内部失败点滥造一个新 code

- `message`
  - 是 safe、operator-readable 的说明
  - 不能包含 secrets、stack trace、raw upstream payload、完整敏感 URL

- `details`
  - 仅用于安全、受控的补充调试字段
  - 建议 allowlist：`provider`, `host`, `status`, `retryable`, `size_bucket`, `route`
  - 禁止包含：
    - token / authorization / secret
    - transcript text
    - multipart body dump
    - 带敏感 query 参数的完整 URL

### 8. 错误上报去重

`RootErrorBoundary` 和 `RouteErrorFallback` 都调用 `logError()` + `reportError()`。当 route-level crash 同时触发两者时，不得重复上报同一错误。实现者必须确认：
- route-level error 被 `defaultErrorComponent` 捕获后，不应再冒泡到 `RootErrorBoundary`
- 或两者共享一个 dedup key（如 `error.message` + `error.name` 的 hash），在短时间窗口内抑制重复上报

## 执行范围（first pass only）

本次只要求标准化高价值 Cloud surface：

1. `apps/cloud-api/asr_relay.go`
2. Cloud discovery HTTP error mapping（当前 discovery backend changed zone）
3. `apps/cloud-api/main.go` 中 `/api/proxy` 的错误响应 / code 映射
4. `apps/cloud-ui` 中与以下场景直接相关的前端关键错误日志：
   - ASR / remote transcript
   - download / media fallback
   - fetch fallback operator-relevant terminal failures
5. `apps/cloud-ui` 中与以下前端错误 owner directly related 的 production surfaces：
   - `router.tsx`
   - route-level error fallback UI
   - `RootErrorBoundary`

不要尝试一次性清洗整个仓库的所有历史错误字符串。

## 命名规范（first pass）

建议前缀：

- `ASR_*`：ASR relay / transcription related
- `DISCOVERY_*`：discovery backend related
- `PROXY_*`：`/api/proxy` related
- `AUTH_*`：authentication / token / permission related（仅在当前 touched surfaces 确实需要时使用）

命名要求：

- 全大写 snake case
- 稳定、可文档化
- 避免把 HTTP 状态码直接塞进 code 名称
- 避免过于泛化的 `UNKNOWN_ERROR` 覆盖太多场景

## 步骤

### 1. 先做 contract audit

1.1 盘点当前高价值 Cloud surfaces 的错误响应 shape
1.2 标出哪些地方已有 `error_class`，哪些地方已有或缺少 `code`
1.3 明确本次 first-pass 的统一目标，不扩大到全仓库

### 2. 前端生产日志修复

2.1 审计以下 changed zone：
- `remoteTranscript.ts`
- `downloadService.ts`
- `fetchUtils.ts`
- `router.tsx`
- route/root error fallback components

2.2 仅将 **operator-relevant terminal failures** 改为 `logError()`
2.3 所有 `logError()` 调用前必须先排除 `AbortError`（使用 `isAbortLikeError()` 或等价检查）
2.4 不要把 retry 中间态、预期 fallback、用户取消升级成 error noise
2.5 所有新增前端错误日志必须遵守脱敏规则
2.6 对 route/root production error UI 做 contract 收口：
- 不显示 raw error text
- 不显示 stack
- 仅保留安全文案与恢复动作
2.7 审计并降级现有 `logError` 误用（见 Section 6 的列表）

### 3. 后端统一错误响应与错误码

3.1 为本次 first-pass 触达的 Cloud API surface 统一稳定 `code`
3.2 保持 `error_class` 继续服务于 observability，而不是替代 `code`
3.3 对 ASR relay、discovery、proxy 的错误映射做最小必要收敛
3.4 如果不能一次性统一到完整 JSON shape，必须在 docs 中记录剩余差异

### 3.5 文档中的 error code index 必须只记录真实实现中的 code

- 不要预先罗列未来占位 code
- reviewer 必须核对 docs 与当前实现中的实际 code 完全一致

### 4. 错误码文档

4.1 创建（双语，必须同时创建）：
- `apps/docs/content/docs/apps/cloud/error-codes.mdx`
- `apps/docs/content/docs/apps/cloud/error-codes.zh.mdx`

4.3 每个文档条目至少包含：
- `code`
- HTTP status
- 适用 route / module
- 触发场景
- 排查建议
- 是否会出现在前端 / 后端日志中（如适用）

## Non-goals

本次不做：

- 全站 UI 错误文案重设计
- Sentry / OpenTelemetry / remote log ingestion 接入
- 整个仓库所有历史错误字符串的一次性迁移
- 非 Cloud changed zone 的大规模错误码重命名
- 为了统一而重写现有 observability 架构
- 新建全局 incident-id service（除非当前 infra 已存在或可极低成本附加）

## 验证

必须有 focused tests / verification，而不只是人工看 console：

### Backend
- ASR relay 错误响应 shape / code 映射测试
- discovery 错误映射测试
- proxy 错误映射测试

### Frontend
- 关键路径在 production-mode logger contract 下仍会调用 `logError()` 的测试
- 确认非 terminal / retry / cancel 不会被错误升级为 `logError()`
- route-level production error UI 不暴露 raw error text
- root-level production error UI 不暴露 raw error text
- dev mode 仍保留必要 diagnostics
- component-level crash 在预期场景下仍保持局部隔离

### Docs
- `error-codes.mdx` 和 `error-codes.zh.mdx` 内容完整
- 文档与当前实际 code 命名一致
- 双语内容语义一致

## Review focus

Reviewer 必须重点检查：

1. 是否把 `error_class` 与 `code` 混用
2. 是否把 retry / cancel / fallback 中间态错误升级成 `logError()` 噪音
3. 所有 `logError()` 调用前是否排除了 `AbortError`
4. 生产 route/root UI 是否仍暴露 raw error text 或 stack
5. `message` / `details` 是否违反脱敏 contract
6. docs 中的 error codes 是否与实际实现完全一致
7. 是否错误地扩大了任务范围，去"顺手"清洗全仓库历史错误
8. `RootErrorBoundary` 和 `RouteErrorFallback` 是否重复上报同一错误
9. 错误响应是否统一设置了 `Content-Type: application/json`
10. `request_id` 是否注入到错误响应 JSON 和 `slog` 上下文
11. 现有 `logError` 误用（exploreStore、playerStore、useSettingsForm、filesStore、historyStore）是否已按 contract 降级

## Documentation

- Update `apps/docs/content/docs/general/technical-roadmap.mdx` **only after Reviewer sign-off**
- Create `apps/docs/content/docs/apps/cloud/error-codes.mdx`（必须）
- Create `apps/docs/content/docs/apps/cloud/error-codes.zh.mdx`（必须，双语同步）

## Completion
- **Completed by**: Worker
- **Commands**: `go test ./...`, `pnpm -C apps/cloud-ui test:run`, `pnpm -C apps/cloud-ui lint`, `pnpm -C apps/cloud-ui typecheck`, `pnpm lint`
- **Date**: 2026-04-04
- **Reviewed by**: Reviewer Reviewer
