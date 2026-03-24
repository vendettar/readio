# Task: 116f (Patch) - Feed Key Normalization Placement + ReadingContent Perf Guard + Route State Standards [COMPLETED]

## Goal
在不改变 116 系列已确立 URL/Country SSOT 的前提下，补齐三项后续强化：
1. 将 `normalizeFeedUrl` 从高频渲染路径前移到 ingestion/写入路径，降低滚动场景 CPU 抖动风险。
2. 对 `ReadingContent` 在低端设备（重点 Android）切换场景建立可验证性能基线与门槛。
3. 在工程规范中明确：`location.state` 仅用于 UI transition 元数据，禁止作为业务正确性依据。

## Constraint Check
- 依据：`apps/docs/content/docs/apps/lite/routing.mdx` 与 `apps/docs/content/docs/apps/lite/episode-resolution.mdx` 已确立 path params 为内容正确性 SSOT。
- 依据：116e 已确立 `fromLayoutPrefix` 从 query 迁移到 `location.state`（UI-only）。
- 要求：不得回退为 query-hint/business-state 参与内容解析。

## Scope Scan (8 Scopes)
- Config: 无新增环境变量。
- Persistence: 可能涉及 feedUrl 归一化写入时机调整；不需要历史兼容迁移（首发策略）。
- Routing: 不改路由结构，仅强化契约与 guardrail。
- Logging: 允许新增轻量 perf 日志或测量埋点（开发态/测试态可见）。
- Network: 无新增 API；仅优化现有 lookup/feed 请求触发时机与复用效率说明。
- Storage: 统一使用 normalized feed key，避免同源 URL 轻微变体造成重复缓存键。
- UI state: `location.state` 继续作为过渡元数据，刷新丢失时必须有 deterministic fallback。
- Tests: 新增性能与契约回归测试，防止重新引入 render-time normalize 与 state-driven correctness。

## Hidden Risk Sweep
- Async control flow:
  - ingestion 前移后，需避免双重 normalize（写入一次、读取又一次）。
  - country 切换时，确保新 key 请求可取消旧请求，避免 stale 覆盖。
- Hot-path performance:
  - 大列表渲染禁止重复 `new URL()` 解析。
  - `ReadingContent` 切换动画期间避免同步重计算阻塞首帧。
- State transition integrity:
  - `location.state` 丢失时不得导致错误业务分支或 action-blocking 状态。
- Dynamic context consistency:
  - feed 缓存键与 country-scoped lookup/episodes 必须保持分层，不得混用导致错配。

## Required Patterns
- `normalizeFeedUrl` 的主执行点放在 ingestion/写入边界；render/query key 只消费已归一化值。
- Feed cache key 统一：`['podcast','feed',normalizedFeedUrl]`。
- Lookup/episodes key 继续 country-scoped，不跨层复用。
- `location.state` 仅允许承载 UI transition 元数据（如 `fromLayoutPrefix`），不得参与内容路由正确性判定。
- `normalizeCountryParam(country)` 继续 strict: `SupportedCountry | null`，禁止回退全局 country。

## Forbidden Dependencies
- 禁止在渲染热路径新增 `new URL()` 标准化逻辑。
- 禁止 `location.state.country`、`location.state.*` 进入内容解析/请求 country 选择。
- 禁止回退至 query hints 作为业务正确性来源。

## Decision Compare (Cost / Risk / Reversibility / Impact)
Option A: 继续 render-time normalize（现状）
- Cost: 低
- Risk: 中（大列表高频场景可积累 CPU 开销）
- Reversibility: 高
- Impact: 性能收益不足，长期可维护性一般

Option B: ingestion-time normalize + render-time no-op（建议）
- Cost: 中
- Risk: 低到中（需确保写入边界完整覆盖）
- Reversibility: 高
- Impact: 热路径更稳定，缓存键一致性更强

结论：采用 Option B。

## Ingestion-Time Normalize 主设计定义
1. 写入时归一化（唯一主入口）
- 所有 remote/library 记录写入持久层前，先执行 `normalizeFeedUrl(rawFeedUrl)`。
- 写入字段使用归一化后的值（`normalizedFeedUrl` 或覆盖 `feedUrl`，项目内保持单一约定）。

2. 读取时零归一化（热路径约束）
- 列表渲染、详情页、query key 构建直接消费已归一化 feedUrl。
- 禁止在 render/useMemo/map 循环中再次做 URL 解析归一化。

3. Cache key 契约
- Feed 相关 key 固定为 `['podcast','feed',normalizedFeedUrl]`。
- Lookup/Episodes 继续使用 country-scoped key，不与 feed key 语义混用。

4. 防御性兜底（可选，且非热路径）
- 对外部临时输入允许在边界层做一次防御 normalize。
- 该兜底不得进入高频渲染路径，也不得替代写入时归一化主流程。

## Implementation Steps
1. Feed normalization 执行点前移
- 梳理 feedUrl 的写入入口（History/Favorites/Subscriptions/Library item ingestion）。
- 在写入入口统一 normalize，一次写入、多处复用。
- 清理渲染路径/列表映射中的重复 normalize 调用（保留必要防御但不可位于热循环）。
- 对 query contract 明确输入已 normalized 的约束（类型或 helper 命名体现）。

2. ReadingContent 性能门槛与观测
- 建立场景基准：Mini -> Docked、Docked -> Full 切换。
- 在测试或开发态加入可重复测量点（首帧可交互时间、切换耗时）。
- 设定最低验收门槛（例如低端 Android 模拟环境下切换不出现明显掉帧/卡顿阈值）。
- 若超门槛：拆分重计算、延后非关键渲染、减少同步工作。

3. Standards 文档补充（教育性规则）
- 更新 `apps/docs/content/docs/apps/lite/coding-standards/standards.mdx` 与 `.zh.mdx`：
  - 解释为何 `location.state` 不可作为业务真相来源：
    - 刷新/直开会丢失，
    - 分享链接不可携带，
    - 不具备跨会话稳定性。
  - 给出允许与禁止示例（Allowed: transition/layout metadata；Forbidden: country/resource identity）。

4. Guardrail / CI 防回归
- 在 route/country guard 脚本扩展两类检查：
  - 内容页业务逻辑禁止读取 `location.state` 的业务字段（allowlist 仅保留 transition metadata）。
  - 禁止在热路径模块中重新引入 render-time `normalizeFeedUrl`/`new URL()` 循环归一化模式。
- 保留 allowlist：`__tests__`、fixture、脚本样本。

5. Docs & handoff sync (Atomic)
- 更新 EN + ZH：
  - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
  - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`
  - `apps/docs/content/docs/apps/lite/routing.mdx`
  - `apps/docs/content/docs/apps/lite/routing.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
  - `apps/docs/content/docs/apps/lite/coding-standards/standards.mdx`
  - `apps/docs/content/docs/apps/lite/coding-standards/standards.zh.mdx`
- 决策日志（如形成新稳定约束）同步 EN + ZH。

## Acceptance Criteria
- Feed key 在运行时不再因 URL 变体产生重复缓存命中分裂。
- 大列表渲染路径不再高频执行 `new URL()` 归一化。
- `ReadingContent` 模式切换在目标低端设备测试中满足已定义门槛。
- `location.state` 仅用于 transition metadata；无业务正确性依赖。
- Guardrail 能阻止上述两类回归。
- EN/ZH 文档同步完成并与代码契约一致。

## Required Tests
- feed key 归一化测试：
  - 不同等价 feedUrl 输入归并到同一 cache key。
  - ingestion 写入后读取路径不重复 normalize。
- 性能回归测试（可半自动+手测记录）：
  - Mini/Docked/Full 切换耗时与掉帧指标对比。
- 规则测试：
  - guard script 对 `location.state` 业务误用与 render-time normalize 误用可拦截。
- 全量回归：
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite lint:route-guards`
  - `pnpm -C apps/lite lint:legacy-route-ban`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules (expected):
  - `apps/lite/src/lib/discovery/podcastQueryContract.ts`
  - feedUrl ingestion/write-path modules（History/Favorites/Subscriptions 相关持久化入口）
  - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`（仅校验不回退业务依赖）
  - `apps/lite/scripts/check-route-country-guards.js`
  - docs/handoff/coding-standards EN+ZH
- Regression risks:
  - ingestion 覆盖不完整导致部分数据未归一化。
  - 过严 guard 误伤合法 UI transition state 使用。
  - 性能测量方案不稳定导致结论不可复现。

## Decision Log
- Required: Yes（记录 feed normalization placement 与 `location.state` boundary rule）。

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite lint:route-guards`
  - `pnpm -C apps/lite lint:legacy-route-ban`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-13
