# Task: 116g (Patch) - Guard Bypass Closure + Session Country Allowlist + Search Episode Semantic Alignment [COMPLETED]

## Goal
收口 116 系列后的 3 个残留风险：
1. 路由守卫脚本仅靠正则，存在 `location.state` 解构/别名绕过路径。
2. `useSession` 的 `countryAtSave` 仅小写化，不做支持地区 allowlist 校验。
3. Search 结果项“进入详情”行为与 `onPlay`/`ariaPlayEpisode` 语义不一致。

## Scope Scan (8 Scopes)
- Config: 无新增 env。
- Persistence: `countryAtSave` 写入前校验收紧（仅 remote/library 相关会话）。
- Routing: 无路由结构变更，仅守卫能力增强。
- Logging: 守卫脚本失败输出应可定位违规语法与文件。
- Network: 无新增 API。
- Storage: 无 schema 变更；仅阻止非法 country 值写入。
- UI state: 无状态模型调整；Search item 交互语义命名修正。
- Tests: 补守卫绕过用例、session country allowlist 回归、Search 语义一致性测试。

## Hidden Risk Sweep
- Async control flow: 无新增异步分支。
- Hot-path performance: AST 守卫运行于 CI/脚本阶段，不进入运行时热路径。
- State transition integrity: 非法 country 不应进入持久化，避免后续跳转进入 action-blocking 分支。
- Dynamic context consistency: country 校验与 `normalizeCountryParam` 保持同一契约，避免双标准。

## Required Patterns
- 内容正确性仍由 path params + 持久化合法字段驱动。
- `countryAtSave` 合法性统一复用 `normalizeCountryParam`（非法值 -> `undefined`，remote/library 路径拒绝落库）。
- 路由守卫禁止依赖脆弱 regex-only 方案处理语义级规则；需 AST 层识别：
  - `const { country } = location.state`
  - `const state = location.state; state.country`
  - `const state = location.state ?? {}; state.country`
  - 等价可选链/别名形式
- Search 结果进入详情行为的命名、事件、aria 文案必须一致。

## Forbidden Dependencies
- 禁止恢复 `location.state.country` 或 query-hints 作为业务正确性输入。
- 禁止在 `useSession` 自造 country 归一化规则（必须复用路由 country 规范化函数）。
- 禁止保留“打开详情”但命名为“play”的误导性语义接口。

## Implementation Steps
1. Route guard 升级（关键）
- 文件：`apps/lite/scripts/check-route-country-guards.js`
- 从 regex-only 升级为 AST 检查（可基于 TypeScript compiler API / ts-morph）。
- 检测并阻断 `location.state` 业务字段读取的解构/别名/可选链变体。
- 保留 allowlist：`__tests__`、`*.test.*`、`routeTree.gen.ts`。

2. Session country allowlist 收紧（关键）
- 文件：`apps/lite/src/hooks/useSession.ts`
- `normalizeCountrySnapshot` 改为复用 `normalizeCountryParam`。
- 非法 country 一律返回 `undefined`。
- `source === 'explore'` 且 country 非法/缺失时：维持拒绝持久化行为并记录日志。

3. SearchEpisodeItem 语义对齐（重要）
- 文件：
  - `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
  - 调用方（如 `SearchPage.tsx`）
- 将 `onPlay` 更名为 `onOpenDetail`（或等价语义命名）。
- 将 `ariaPlayEpisode` 替换为“打开详情”语义 key（新增 i18n key 时需全语言同步）。
- 保持现有导航行为不变，仅修正语义命名与可访问性表述。

4. 文档与守卫说明同步
- 更新 EN + ZH：
  - `apps/docs/content/docs/apps/lite/coding-standards/standards.mdx`
  - `apps/docs/content/docs/apps/lite/coding-standards/standards.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
- 明确说明：
  - 守卫采用 AST 级检测，覆盖解构/别名绕过；
  - `countryAtSave` 合法性与 route-country 契约同源；
  - Search item 的“打开详情”语义规范。

## Acceptance Criteria
- 守卫脚本可拦截 `location.state` 的点访问、可选链、解构、别名读取业务字段。
- `useSession` 不会将非法 country（如 `xx`）写入 `countryAtSave`。
- `source=explore` 在 country 非法/缺失时拒绝持久化路径保持有效。
- Search 结果项接口与 aria 文案语义均反映“打开详情”，无“play”语义漂移。
- EN/ZH 文档与实现一致。

## Required Tests
- `apps/lite/src/__tests__/routeGuards.script.test.ts`
  - 新增解构/别名/可选链绕过样例，确认 guard 失败。
- `apps/lite/src/hooks/__tests__/useSession*.test.ts`
  - 非法 country 输入不落库；合法 country 正常落库。
- `apps/lite/src/components/GlobalSearch/__tests__/SearchEpisodeItem*.test.tsx`
  - 接口语义与 aria 文案改名后行为不变。
- i18n 审核：新增/变更 key 在全语言完整。

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite i18n:check`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/scripts/check-route-country-guards.js`
  - `apps/lite/src/__tests__/routeGuards.script.test.ts`
  - `apps/lite/src/hooks/useSession.ts`
  - `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
  - Search 调用方与对应测试
  - standards/handoff docs (EN + ZH)
- Regression risks:
  - AST 守卫规则过严导致误报；
  - 语义改名遗漏调用点导致类型错误；
  - country 收紧影响少量异常会话持久化路径。

## Decision Log
- Required: Yes（记录 guard 从 regex-only 升级为 AST、country allowlist 收紧决策）。

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:route-guards`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite i18n:check`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-13
