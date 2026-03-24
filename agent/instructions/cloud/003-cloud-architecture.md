# Instruction 003: Cloud Backend Integration & Server-Mediated Architecture

## 1. 目标 (Objective)
建立 Readio Cloud 版的“服务器中枢架构”。彻底解耦 `apps/lite`（纯浏览器直连）与 Cloud 版（后端网关转发）的网络模型。

关键前提：

- Cloud 版应按 **双 App** 拆分落地，而不是继续把前端和 Go 服务混成一个模糊目录边界。
- 推荐目标拓扑：
  - `apps/lite`: PWA / browser-backed standalone app
  - `apps/cloud-api`: Go backend
  - `apps/cloud-ui`: Cloud frontend
- `apps/lite` 与 `apps/cloud-ui` 是 **两个独立 webapp**，不是“同一个 app 的 lite/cloud 双模式”。
- 两者可以共享 UI、schema、domain mapping，但 **不能共享同一套 networking boundary**。
- `apps/lite` 继续承担纯前端约束；`apps/cloud-ui` 必须把 discovery / search / feed / RSS 请求正式收归同源后端 API。

目标边界：

- **Lite 版**：继续保持 PWA 离线能力、浏览器直连、CORS 代理降级。
- **Cloud 版**：采用 Server-Mediated 模式。`apps/cloud-ui` 前端 **仅** 与同源 `apps/cloud-api` 通信。后端拥有搜索、抓取、解析、缓存、错误映射的所有控制权。

---

## 2. 核心架构变更 (Core Architecture Changes)

### A. 前端：按 app 边界拆分 discovery networking
- **保留共享 UI，不共享 networking model**：可复用的页面/组件应继续服务于 `apps/lite` 与 `apps/cloud-ui`，但 discovery 数据来源必须由各自 app 持有。
- **推荐物理落位**：Cloud 前端不要继续寄生在 `apps/lite` 的构建入口上；应作为独立 `apps/cloud-ui` 存在，再逐步把可复用展示组件抽到 `packages/ui`。
- **共享边界优先级**：
  - 第一阶段优先抽离稳定的 presentation 组件
  - 不要一开始就大规模搬迁 `apps/lite` 全量 UI 到 `packages/ui`
- **Lite 实现**：`apps/lite` 继续使用 browser-backed discovery implementation，保留 Apple 直连 + CORS proxy fallback。
- **Cloud 实现**：`apps/cloud-ui` 必须改为 server-backed discovery implementation；所有 discovery 请求统一走同源 `/api/v1/discovery/*`。
- **禁止 build-time 模式开关**：不要通过 `VITE_READIO_MODE` 或类似编译期 flag 把同一个前端构建伪装成 lite/cloud 双模式。

### A1. UI 复用方式：控制反转，但边界收敛在 container / hook / provider
- **禁止 UI 组件直连 discovery 实现**：共享 UI 组件不得直接 import browser/server discovery client。
- **推荐 IoC 位置**：把注入边界放在 app 顶层 container、domain hook、provider 层，而不是把几百个纯展示组件都硬绑到一个全局“大 Context”。
- **推荐模式**：
  - `packages/ui`：只放 presentation-first 组件
  - app-owned container / hooks：负责调用 discovery capability
  - app 顶层：注入 `BrowserDiscoveryProvider` 或 `ServerDiscoveryProvider`
- **结果要求**：中间层展示组件只消费稳定的 props / view model，不感知当前运行在 lite 还是 cloud-ui。

### B. 后端：网关化接口 (Backend Gateway APIs)
`apps/cloud-api` 应提供完整、可替代前端直连能力的标准化 JSON 接口。至少覆盖当前 Lite discovery 使用面：

1. `GET /api/v1/discovery/search/podcasts?q=...`
2. `GET /api/v1/discovery/search/episodes?q=...`
3. `GET /api/v1/discovery/lookup/podcast?id=...`
4. `GET /api/v1/discovery/lookup/podcast-episodes?id=...`
5. `GET /api/v1/discovery/top-podcasts`
6. `GET /api/v1/discovery/top-episodes`
7. `GET /api/v1/discovery/feed?url=...`

约束：

- `apps/cloud-ui` 不得继续直接访问 `itunes.apple.com`、`rss.applemarketingtools.com` 或任意第三方 feed 源。
- `/feed` 是关键路径：后端抓取原始 XML RSS，完成解析，只返回前端所需的精简 JSON（包含 episodes 清单）。
- Cloud mode 必须 **fail closed**：如果后端 API 未实现或失败，不允许偷偷退回 Lite 的浏览器直连路径。

### C. UI：环境态感知 (Environment Awareness)
- **Cloud 版移除 CORS Proxy 心智模型**：`apps/cloud-ui` 的设置页不应继续暴露 `CORS Proxy` 配置项或相关 badge。
- **Lite 版保留现状**：`apps/lite` 继续保留 CORS proxy 作为纯前端能力的一部分。
- **错误处理**：Cloud 版网络错误必须由后端网关统一包装（例如：后端返回 502 时前端展示“源站解析失败”，而不是浏览器 fetch/CORS 错误）。

---

## 3. 技术标准与最佳实践 (Technical Standards)

### 数据预处理 (Preprocessing)
- **禁止前端解析 XML (In Cloud Mode)**: 为了减小前端 Bundle Size 和提升移动端性能，Cloud 版的 RSS 解析逻辑必须 100% 放在 Go 后端。
- **契约对齐**：前端的 JSON 交换结构应继续以 `packages/core` 的 schema 为 TypeScript 侧契约来源；Go 后端必须按同一 JSON contract 返回，并通过集成测试保证兼容，而不是在 Go 端“直接使用 Zod”。

### 缓存策略 (Caching)
- **后端缓存**: 后端对于 Apple API 的请求应实现 LRU 缓存（例如：缓存 1 小时的 Top List），极大提升用户响应速度，避免频繁触发 Apple 的频率限制。

### 安全控制 (Security)
- **User-Agent 模拟**: 后端应统一管理搜索请求的 User-Agent，避免由于不同地区浏览器指纹不同导致的请求被阻断（RSS 常见问题）。
- **Feed 网关安全边界**：`/api/v1/discovery/feed` 必须继承 Cloud 已有的 SSRF 防护、redirect fail-closed、timeout、body limit、allowed scheme/host policy，不能只是“后端代抓 RSS”。

### 共享边界 (Shared Boundary)
- **允许共享**：`packages/ui` 中的展示组件、route-level presentation、schema、domain mapping、通用格式化逻辑。
- **禁止共享**：Lite 的 browser-direct networking contract、CORS proxy assumptions、Cloud 的 same-origin backend contract、app bootstrap 与 runtime networking wiring。

### 部署管道 (Deployment Consequence)
- Cloud CD 现在应遵循双产物契约：
  - build `apps/cloud-ui`
  - build `apps/cloud-api`
  - 一起发布到 VPS
- Cloud 部署文档、handoff、smoke check 应同步反映 `cloud-ui + cloud-api` 双产物契约。

---

## 4. 实施阶段 (Phases)

1. **Phase 1: 边界收敛**
   - 拍板 app topology：`apps/lite` / `apps/cloud-api` / `apps/cloud-ui`
   - 保留共享 UI，拆开 discovery networking implementation
2. **Phase 2: Cloud API 覆盖**
   - 在 Go 中实现完整 discovery/search/feed/top/list API 覆盖
   - 先覆盖当前 Explore / Search / Podcast 详情真实使用面
3. **Phase 3: Cloud 前端切换**
   - 建立 `apps/cloud-ui`
   - 让 `apps/cloud-ui` 只走 same-origin discovery APIs
   - 禁止 fallback 回浏览器直连
4. **Phase 4: UI 与文档收口**
   - Cloud 版隐藏 `CORS Proxy`
   - 同步 handoff / architecture / monorepo docs / decision log
   - 更新 `cd-cloud.yml`、deployment docs、smoke check
   - 补齐错误映射、缓存、回归测试

---

## 5. Implementation Backlog

The architecture direction above is considered settled. Follow-up work should execute against this backlog rather than reopen the topology debate.

### Backlog A: Repository Topology Anchors
Goal:

- keep the current topology visible in the repo without performing a large migration in one step

Scope:

- keep `apps/cloud-api` as the current Go scaffold
- keep `apps/cloud-ui` as the future frontend landing zone
- document that the backend scaffold now lives at `apps/cloud-api`

Done when:

- repository docs, handoff docs, and scaffold placeholders all agree on the current topology:
  - `apps/lite`
  - `apps/cloud-ui`
  - current `apps/cloud-api`

Do not:

- rename `apps/cloud-api` yet if that rename would cascade into workflow/docs/test breakage without a dedicated instruction

### Backlog B: Cloud UI Minimal App Skeleton
Goal:

- keep `apps/cloud-ui` as the current frontend shell while preserving its app-owned discovery wiring and shared presentation boundary

Scope:

- minimal React/Vite app shell
- no browser-direct discovery wiring
- no `packages/ui` extraction yet beyond trivial reuse if already available

Done when:

- `apps/cloud-ui` builds independently
- the shell clearly represents the current Cloud-only frontend app

Do not:

- copy the full `apps/lite` tree into `apps/cloud-ui`
- introduce browser-direct discovery or CORS proxy assumptions into `apps/cloud-ui`

### Backlog C: Cloud API Surface First
Goal:

- implement the minimum same-origin backend API surface needed to remove browser-direct discovery from Cloud frontend

Priority order:

1. top podcasts
2. top episodes
3. podcast lookup
4. podcast episodes lookup
5. search podcasts
6. search episodes
7. feed fetch/parse

Done when:

- `apps/cloud-ui` can retrieve its first discovery screens entirely through same-origin backend APIs
- no direct requests from Cloud frontend reach Apple endpoints

Do not:

- leave partial backend coverage and silently fallback to Lite browser networking

### Backlog D: Shared UI Extraction
Goal:

- extract only the highest-confidence presentation components into `packages/ui`

Priority candidates:

- page shell
- header/layout primitives
- cards, rows, badges, section wrappers

Done when:

- shared components are presentation-first and networking-agnostic
- app-owned containers and hooks remain outside `packages/ui`

Do not:

- move app bootstrap, runtime config wiring, discovery clients, or route-specific data orchestration into `packages/ui`

### Backlog E: Cloud CD Cutover
Goal:

- keep the dual-artifact Cloud deployment contract reflected in workflow, docs, and smoke checks

Scope:

- keep CD contract aligned to:
  - `apps/cloud-ui`
  - `apps/cloud-api`

Done when:

- workflow builds both Cloud artifacts
- deployment docs describe both artifacts
- smoke checks validate both backend health and frontend artifact presence

Do not:

- mutate `cd-cloud.yml` without keeping it aligned to the dual-artifact Cloud contract

### Execution Rule
Each backlog item should be handled by a focused follow-up instruction.

Required qualities of each follow-up:

- atomic scope
- explicit changed-zone file list
- verification commands
- doc sync requirements
- a clear “do not fold in” list to prevent adjacent architecture work from leaking into the same task

## 6. Child Instructions

The backlog above is implemented through these child instructions:

- `agent/instructions/cloud/003a-search-vertical-slice.md`
- `agent/instructions/cloud/003b-feed-parsing-vertical-slice.md`
- `agent/instructions/cloud/003c-cloud-ui-route-and-app-shell.md`
- `agent/instructions/cloud/003d-first-shared-ui-extraction.md`
- `agent/instructions/cloud/003e-cloud-to-cloud-api-rename.md`
- `agent/instructions/cloud/003f-cloud-cd-cutover.md`

Recommended execution order:

1. `003a`
2. `003b`
3. `003c`
4. `003d`
5. `003e`
6. `003f`

---

> **CRITICAL RULE**: 严禁把这项工作实现成“同一个 app 里到处判断 `if (isCloud)`”。`apps/lite` 与 `apps/cloud-ui` 是两个独立 webapp；差异应落在 app-owned discovery implementation、provider/container 注入边界、以及 `apps/cloud-api` 后端 API 契约，而不是污染核心 UI 组件。
