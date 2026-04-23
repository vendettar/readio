---
description: 实现 Readio Cloud 专用的 ASR 上游转发 Worker，作为 apps/cloud-api 到 provider upstream 之间的可选 egress hop（首批仅启用 Groq）
---

# 指令 012：部署 Readio Cloud 专用 ASR 代理 Worker (Cloudflare Workers, provider-oriented / Groq-first) [COMPLETED]

## 1. 目标
为 Readio Cloud 提供一个高性能、安全的 ASR 上游转发 Worker。该 Worker 部署在 Cloudflare Workers 上，用于中转 **`apps/cloud-api` 发往 provider transcription endpoint 的转写提交请求**，以降低单一 VPS 出口 IP 风险并提供可选的分布式 egress。

当前架构下，浏览器已经通过 `apps/cloud-api` 的 same-origin ASR relay 提交转写请求。因此本指令 **不是** 浏览器 CORS 解决方案，也 **不是** 浏览器直接调用的代理层。

Worker 的定位必须是：

- browser -> `apps/cloud-api` same-origin relay（保持不变）
- `apps/cloud-api` -> Cloudflare Worker -> provider upstream（本指令新增/强化）

本指令当前只定义 **首批 rollout: Groq transcription egress**。

要求：

- 架构层面保留 provider-oriented contract
- 当前实现只启用 Groq
- 其他 provider 必须显式 fail closed，直到后续指令重新开启
- 不要为了“未来多 provider”过度抽象成 generic outbound proxy

## 2. 核心细节
- **流式转发 (Streaming Proxy)**：直接透传 `request.body`，不进行解析，以适配 10MB+ 的音频文件并保持极低的 CPU 占用。
- **后端鉴权 (Backend Auth)**：Worker 校验自定义 Header `X-Readio-Cloud-Secret`。
- **目标收敛**：当前首批 rollout 仅启用 Groq transcription endpoint；其他 provider 明确拒绝。
- **错误透传**：完整保留并转发 Groq 的 HTTP 状态码和错误 JSON。
- **可回退 (Fallback)**：Worker transport 是可选模式；未配置或不可用时，`apps/cloud-api` 必须仍可 direct-to-Groq。

## 3. 核心边界

### 3.1 保持 `apps/cloud-api` 为 ASR contract owner
不要让 Worker 变成新的 ASR contract owner。

必须保持：

- 浏览器仍然只调用 `apps/cloud-api`
- `apps/cloud-api` 仍然负责请求校验、provider allowlist、错误分类、同源安全边界
- Worker 只是 backend upstream hop，不替代 backend relay ownership

### 3.2 Worker 不是浏览器公开代理
Do not design this Worker as a browser-facing generic proxy.

因此：

- 不要把它当成浏览器 CORS 网关
- 不要保留宽松 `Access-Control-Allow-Origin: *` 作为默认 contract
- 不要为了浏览器调用去设计 `OPTIONS`/preflight surface，除非后续明确有非浏览器客户端需要

### 3.3 当前只启用 Groq transcription submit
当前 scope 只允许 **Groq transcription submit** 走 Worker。

不要在本指令中扩展：

- provider verify/readiness
- browser-direct provider checks
- discovery/media proxy logic
- generic outbound POST tunnel
- 把非 Groq provider 一起接入首批 rollout

### 3.4 当前阶段不做隐式 provider 推断
当前阶段 Worker 不应从 body、header、query 中推断 provider。

必须保持：

- route 本身决定唯一允许的 upstream
- Worker 不解析 `provider` form field 来分支
- `apps/cloud-api` 负责决定当前请求是否允许切到 Worker transport
- provider enablement 必须是显式配置/显式代码路径，不是“类型支持了就算可用”

## 4. Worker 路由 contract

不要使用原文中的 raw target URL path 形式：

- `worker/https/api.groq.com/...`

这会把 Worker 做成受限版通用代理，边界不够硬。

应改为 **显式 provider-operation 路由 contract**，但首批只启用 Groq：

- `POST /relay/groq/transcriptions`

后续 provider 如果要加入，必须单独显式增加：

- 自己的固定 route
- 自己的 upstream mapping
- 自己的启用开关/allowlist
- 自己的验证与文档同步

要求：

- HTTPS-only upstream
- route 只允许映射到固定 provider transcription endpoint
- 不允许调用方通过 path 拼接任意 host/path
- 当前实现只允许 Groq route；其他 provider route 不要预实现成默认开放状态

## 5. Worker 源代码清单

在 `apps/cloud-api/resources/workers/asr-proxy.js` (或类似目录) 创建源码作为参考实现方向。

可以保留 provider-oriented 内部结构，但首批实现只接入 Groq route / Groq upstream。不要让“未来扩展性”演变成当前 generic proxy surface。

## 6. 后端集成规范 (Go Side)
在 `apps/cloud-api` 中调用此 Worker 时，请遵循：
- **请求头**：必须携带 `X-Readio-Cloud-Secret`。
- **请求体**：原始 `multipart/form-data` 字节流。
- **URL 格式**：例如 `https://[YOUR_WORKER_URL]/relay/groq/transcriptions`。
- **超时设置**：由于 ASR 耗时较长，Go 端的 HttpClient Timeout 应至少设为 60s。
- **启用方式**：仅在配置了 Worker base URL 和 shared secret 时启用该 transport；未配置时默认 direct-to-provider。

并且必须明确：

- 只有 Groq transcription submit 可以切到 Worker
- 非启用 provider 必须在 `apps/cloud-api` 中先被拒绝，而不是“顺手 direct”或“顺手走 Worker”
- `GET /api/v1/asr/verify` 仍保持当前 backend direct-to-Groq contract，除非后续指令明确扩展范围
- browser-supplied provider API key 仍然只是瞬时请求数据，不能在 Worker 或 backend 落盘、缓存、日志输出
- Worker transport 失败或未配置时，backend 应允许回退 direct-to-Groq，而不是改变浏览器 contract

## 6.1 Rollout / Rollback Rules

必须以运行时配置控制 Worker transport，例如：

- `READIO_ASR_WORKER_BASE_URL`
- `READIO_ASR_WORKER_SHARED_SECRET`

要求：

- 两者都配置时，才允许 backend 尝试 worker transport
- 任一缺失时，backend 默认 direct-to-Groq
- rollback 方式必须简单：移除/清空相关 env 后恢复 direct path
- 不允许让浏览器感知 transport mode 变化

## 7. Security Requirements

1. Secret 必须只来自 Worker env/secret，不能在源码里保留 fallback secret。
2. Worker 只允许固定 Groq route，不能接受原始 target URL。
3. Worker 只允许 HTTPS upstream。
4. Worker 必须去掉 `X-Readio-Cloud-Secret` 再向 provider 转发。
5. Worker 不应成为浏览器可直接使用的开放 surface。
6. Worker 和 backend 的日志中都不得输出 provider API key、shared secret、Authorization header。
7. Worker 必须拒绝任何未显式启用的 provider / operation。

## 7.1 Observability Requirements

必须补充最小可观测性，以便区分：

- backend -> Groq direct path 问题
- backend -> Worker -> Groq path 问题

至少要求：

- backend 记录当前 transport mode：`direct` / `worker`
- backend 记录 upstream duration / status / failure class
- Worker 记录 route、status、duration，但不得记录密钥和请求体
- 日志字段要能支撑后续排查 egress、限流、网络波动问题

## 8. Testing / Verification Requirements

至少需要覆盖：

1. 缺失或错误 secret -> `401`
2. 错误 route -> `404`
3. 非 `POST` -> `405`
4. Groq 上游 `401/429/5xx` 状态透传
5. 正常 multipart Groq transcription submit 能流式转发成功
6. backend integration test 证明：
   - `apps/cloud-api` only switches Groq transcription submit transport
   - non-enabled provider request fails closed
   - verify/readiness 不被顺手改走 Worker
   - worker env 已配置时走 worker
   - worker env 缺失时回退 direct-to-Groq

## 9. 验收标准
1. 发起不带 `X-Readio-Cloud-Secret` 的 backend request，Worker 返回 `401`。
2. 发起访问非 `/relay/groq/transcriptions` 的请求，Worker 返回 `404`。
3. 使用正确 secret 转发 15MB 音频切片到 Groq，返回 Groq 原始状态码和响应体。
4. `apps/cloud-api` 仍然是浏览器唯一调用的 ASR surface；浏览器不直接调用 Worker。
5. 清空 Worker 相关 env 后，backend 恢复 direct-to-Groq，浏览器 contract 无变化。
6. 非启用 provider 不会因为 worker rollout 而被误开放。

## 10. Explicit Non-Goals

- 不把 Worker 做成浏览器 CORS 代理
- 不把 Worker 做成通用 outbound URL tunnel
- 不把 provider verify/readiness 一起迁移进去
- 不把它扩展成“所有 provider 现已可用”的 Worker 框架
- 不改变 `apps/cloud-api` 作为 same-origin ASR relay owner 的现有架构

---

## Completion

- **Completed by**: Execution Agent
- **Date**: 2026-04-01
- **Commands**: `go build ./...` ✅, `go test ./... -count=1` ✅ (all tests pass, zero regressions)
- **Reviewed by**: *(pending review)*

### Deliverables

1. **Worker source**: `apps/cloud-api/resources/workers/asr-proxy.js`
   - Provider-oriented route: `POST /relay/groq/transcriptions`
   - `X-Readio-Cloud-Secret` backend auth (constant-time compare)
   - Streaming body passthrough (no buffering)
   - HTTPS-only upstream enforcement
   - Observability: route/status/duration JSON logs, `X-Readio-Worker-Duration-Ms` header
   - Security: secret stripped before upstream, no secret/key logging

2. **Go-side integration**: `apps/cloud-api/asr_relay.go`
   - New env vars: `READIO_ASR_WORKER_BASE_URL`, `READIO_ASR_WORKER_SHARED_SECRET`
   - `asrWorkerTransportEnabled()` — both must be configured
   - `transcribeViaWorker()` — builds multipart, sends to Worker with secret header
   - Groq transcription submit only; verify stays direct
   - Automatic fallback to direct-to-Groq on Worker failure
   - Transport mode logged: `direct` / `worker` with duration/status

3. **Tests**: `apps/cloud-api/asr_relay_test.go` — `TestASRWorkerTransport` (13 subtests)
   - Enablement logic (4 cases)
   - Worker routing with header/route/auth verification
   - Fallback on Worker failure
   - Direct path when unconfigured
   - Verify stays direct even when Worker enabled
   - Secret/API key leak prevention in response + logs
   - Error status passthrough
