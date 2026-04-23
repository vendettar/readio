---
description: 归档的 Cloud ASR 传输策略备选方案：按地区/可达性在 direct 与 relay 之间做一次探测后缓存决策
---

# Archived 001: Cloud ASR Transport Strategy (`auto | direct | relay`)

## 1. 背景

该方案源于一个现实约束：

- Cloud ASR transcription 的音频切片是当前系统内最大的请求体之一
- 如果 Cloud 版本一律走 backend-first：
  - browser -> `apps/cloud-api`
  - `apps/cloud-api` -> Groq / Worker
- 那么所有音频流量都会穿过：
  - VPS 出口带宽
  - Cloudflare Worker 请求额度（若启用 Worker）

对资源约束较强的部署环境（例如 1C1G VPS、月流量 2TB、Worker 请求额度有限）来说，这可能不是成本最优策略。

同时，Groq 对某些地区可直接访问、对某些地区不可访问，这意味着：

- 让所有用户都走 relay 会造成不必要的中转流量
- 让所有用户都走 direct 会导致部分地区完全不可用

因此，这里记录一个**架构备选**：

- `transportMode = auto | direct | relay`

注意：这份文档是 **archived architecture option**，不是当前已执行路线。

## 2. 方案摘要

### 2.1 三种 transport mode

#### `direct`
- 浏览器直接请求 Groq transcription endpoint
- 不经过 `apps/cloud-api`
- 优点：节省 VPS / Worker 中转流量
- 风险：地区可达性、浏览器网络环境、CORS / provider policy 变化

#### `relay`
- 浏览器请求 `apps/cloud-api`
- `apps/cloud-api` 再决定：
  - direct-to-Groq
  - 或 Worker -> Groq
- 优点：稳定、同源、后端可观测
- 风险：额外中转流量和后端压力

#### `auto`
- 首次只做一次**轻量 direct capability probe**
- 然后把结果缓存起来
- 后续 transcription 直接使用选定路径
- 不在每次 transcription 前都重新 probe

### 2.2 推荐默认值

如果采用该方案，推荐：

- 默认 `transportMode = auto`

而不是：

- 永久 backend-first
- 或每次 transcription 前都先 verify

## 3. 为什么不推荐“每次先 verify 再 transcription”

虽然 `verify` 请求体较小，但这个策略仍然不理想：

1. `verify success` 不等于 transcription success
   - transcription 是大 multipart 上传
   - provider 对 verify 和 transcription 的网络/风控行为不一定一致

2. 会让每次转写都额外多一次探测请求

3. 会把 transport 选择状态机做复杂：
   - verify 成功 -> direct?
   - verify 失败 -> relay?
   - verify 成功但 transcription 失败 -> 再 fallback?

因此，如果采用能力探测，应该是：

- **少量探测**
- **结果缓存**
- **后续直接使用结果**

而不是：

- **每次都 probe**

## 4. 推荐设计

### 4.1 运行时配置

前端可持有一个显式 transport 选择：

- `auto`
- `direct`
- `relay`

行为建议：

- 初始默认：`auto`
- 用户可手动覆盖成 `direct` 或 `relay`

### 4.2 `auto` 模式行为

首次需要 ASR 时：

1. 发送一个轻量 direct capability probe
   - 只测试浏览器对 Groq 的实际可达性
   - 请求体尽可能小

2. 若 probe 成功
   - 将当前 session / 短期缓存标记为 `direct-capable`
   - 后续 transcription 走 `direct`

3. 若 probe 失败
   - 将当前 session / 短期缓存标记为 `relay-required`
   - 后续 transcription 走 `relay`

### 4.3 缓存原则

probe 结果不应每次重算。

建议：

- 至少按 session 缓存
- 可选按短 TTL 持久化（例如数小时或一天）

但不要：

- 永久缓存“这个地区一定可达/不可达”
- 每次 transcription 前都重新验证

## 5. relay 模式下的后端行为

如果进入 `relay` 模式，后端仍可维持当前 Cloud 设计：

- browser -> `apps/cloud-api`
- `apps/cloud-api` 优先尝试 Worker egress（若已配置）
- Worker hop 失败时 fallback 到 backend direct-to-Groq
- Groq 自己返回错误时，不再重复 direct 重试

也就是说，这份 archived 方案**不否定**当前 `012` 的价值。
它只是为“哪些用户应该进入 relay 路径”提供另一种成本导向的思路。

## 6. 优点

1. 对可直连 Groq 的用户：
   - 避免不必要经过 VPS / Worker
   - 节省后端带宽和中转成本

2. 对不可直连地区：
   - 仍可通过 relay 保证可用性

3. 比“所有人一律 backend-first”更节省资源

4. 比“每次都先 verify 再决定”更少额外请求

## 7. 风险与代价

1. 会形成双路径系统：
   - direct
   - relay

2. 观测和调试复杂度上升
   - 一部分错误发生在浏览器 direct
   - 一部分错误发生在 backend / Worker

3. capability probe 只是近似判断
   - 并不能严格保证后续 transcription 一定成功

4. 需要额外的前端 transport state 管理

5. 需要更严格的测试矩阵：
   - auto -> direct
   - auto -> relay
   - manual direct
   - manual relay

## 8. 适用前提

该方案只适用于以下前提同时成立时：

1. 浏览器 direct-to-Groq 在产品上是允许的
2. 用户自己的 Groq key 可在浏览器侧使用
3. provider 的浏览器直连 contract 在实际环境中可行
4. 团队接受双路径复杂度，以换取带宽/成本收益

如果这些前提不成立，则应继续采用：

- Cloud backend-first

## 9. 为什么这份方案被归档而不是直接执行

这份方案被放入 `archived/`，原因不是它一定错误，而是：

1. 当前 Cloud 已经朝 backend-owned ASR transport 方向实现
2. 当前 `012` / `apps/cloud-api` / Worker 路径已经成型
3. 这份方案会重新引入 browser direct path 作为正式分支
4. 它需要额外的产品、运维、测试和可观测性设计

因此，它更适合作为：

- 成本/流量受限时的架构备选

而不是：

- 当前默认执行路线

## 10. Explicit Non-Goals

- 不修改当前 `012`
- 不修改当前 `apps/cloud-api` ASR relay 实现
- 不让这份 archived 文档自动成为新的默认架构
- 不把“每次 verify 再 transcription”当作推荐方案
