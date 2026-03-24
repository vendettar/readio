# Instruction 125b: Downloads Subtitle Version Management (Progressive Disclosure) [COMPLETED]

## Hard Dependencies
- Instruction 124 must be completed.
- Instruction 125 must be completed.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

## Goal
在 Downloads 页面支持“一个单集对应多个字幕版本（不同转译来源）”的可管理能力，但不把列表卡片做成重型管理器。

核心策略：
- 列表层轻量（摘要信息）。
- 详情层管理（版本切换、导出、删除）。
- 播放层单一真相（单集始终只有一个 `active subtitle`）。

## Product Decisions (Locked)
1. **复用 Files 卡片结构**，Downloads 列表采用与 Files 页面同源的音频卡片体系。
2. 列表卡片只显示摘要：
   - 字幕版本数量
   - 当前生效版本
   - 最近转译来源（provider/model）
3. 版本管理入口放在详情抽屉/侧栏（点击卡片或“Manage subtitles”按钮进入）。
4. 运行时行为固定为“单一 active subtitle”：
   - 任一时刻仅一个版本参与播放/阅读。
   - 切换版本必须原子更新 active mapping。
5. 导出能力在详情层提供：
   - 导出当前版本
   - 导出指定版本
   - 批量导出该单集全部版本（固定为 zip）。
6. 单版本场景自动降级：
   - 不展示复杂版本控制文案，只显示“Subtitle available”。
7. 删除当前 active 版本后的回退规则固定：
   - 回退到该单集“最近创建且可用”的版本（`createdAt` 降序第一条）。
   - 若无可用版本，`active subtitle` 置空。
8. 并发冲突优先级固定：
   - 手动切换 active 的用户操作优先级高于后台 ASR 新版本写入。
   - 后台任务成功写入不得自动覆盖用户刚选择的 active。
9. 历史兼容策略固定：
   - 本指令按首次部署实现，不做历史数据迁移/回填，不兼容旧 schema。
   - 初始化时若缺表/缺索引，直接按新 schema 创建。

## Scope
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- `apps/lite/src/components/Player/PlayerDownloadAction.tsx`
- `apps/lite/src/routeComponents/podcast/EpisodeDetailDownloadButton.tsx`
- `apps/lite/src/components/EpisodeRow/*`（如复用行模型需同步）
- `apps/lite/src/components/Transcript/*`（active subtitle 切换后的展示一致性）
- `apps/lite/src/lib/repositories/*`（字幕版本查询与 active 更新）
- `apps/lite/src/lib/db/types.ts`
- `apps/lite/src/lib/dexieDb.ts`
- `apps/lite/src/lib/__tests__/*`
- `apps/lite/src/components/**/__tests__/*`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

## Scope Scan (8 Scopes)
- Config: 无新增 runtime config（除非实现层证明必需）。
- Persistence:
  - 字幕版本需可追踪 `provider/model/language/createdAt/status`。
  - active subtitle 映射必须可审计。
- Routing:
  - 无新增路由；使用现有页面内抽屉/侧栏状态。
- Logging:
  - 记录版本切换与导出失败，不记录敏感凭据。
- Network:
  - 仅涉及已有 ASR/导出路径；不新增后端依赖。
- Storage:
  - 保持下载音频与字幕版本引用一致，不产生孤儿映射。
- UI state:
  - 列表状态与详情状态解耦，避免全局重渲染。
- Tests:
  - 覆盖版本切换、导出、删除、单版本降级显示。

## Hidden Risk Sweep
- Async control flow:
  - 详情抽屉内切换 active subtitle 时避免竞态覆盖（latest-write-wins 或 request token）。
- Hot path performance:
  - 列表页不得加载所有字幕正文，只加载版本摘要。
- State transition integrity:
  - 删除当前 active 版本时必须自动、确定性回退到可用版本；若无可用版本则明确置空。
- Data integrity:
  - 版本删除后需清理映射，防止“active 指向不存在版本”。
  - 多 track 引用同一 subtitle 实体时，删除单 track 不得误删共享 subtitle。

## Required Patterns
- Progressive disclosure:
  - 列表展示摘要，管理操作放到详情层。
- Active subtitle SSOT:
  - 一个 episode 仅一个 active 映射，统一由 repository 更新。
  - `setActive` / `deleteVersion` / `fallbackActive` 必须在单个 DB transaction 内完成。
- Metadata normalization:
  - provider/model/language/createdAt/status 字段统一，禁止临时拼接字符串当状态源。
- Playback/Reading SSOT:
  - 播放器与阅读区仅通过 repository 的 `getActiveSubtitleByTrackId(trackId)` 读取当前字幕。
  - 禁止 UI 层从版本列表自行推断 active。
- Concurrency determinism:
  - 手动 `setActive` 必须写入 `manualPinnedAt`。
  - 后台 ASR 写入版本时，若检测到 `manualPinnedAt` 晚于该任务启动时间，则不得覆盖 active。

## Data Contract (Required)
- 版本元数据字段（每个版本必填）：
  - `trackId`
  - `subtitleId`
  - `sourceKind`（如 `manual_upload` / `asr_online` / `asr_background`）
  - `provider`
  - `model`
  - `language`
  - `createdAt`
  - `status`（`ready` / `failed`）
- 列表摘要查询禁止加载字幕正文，只返回摘要字段。
- 版本列表固定排序：`createdAt` 降序。
- active 映射唯一性：
  - 单个 track 在任一时刻仅允许一个 active subtitle。
  - active 目标必须存在于该 track 的版本集合内。
  - `status !== ready` 的版本禁止设为 active。
- DB 约束与索引（必须落地）：
  - active 映射唯一约束：`unique(trackId)`。
  - 版本排序索引：`index(trackId, createdAt)`（查询时按 `createdAt desc`）。
  - 回退查询索引：`index(trackId, status, createdAt)`。
  - 引用清理索引：`index(subtitleId)`。
- 命名与导出 contract（固定）：
  - 单版本导出文件名：`{episodeSlug}.{language}.{sourceKind}.{createdAt}.srt`。
  - 全部版本导出 zip：`{episodeSlug}.subtitles.zip`。
  - 批量导出允许部分成功；失败项需在结果中返回并在 UI 提示。

## Forbidden Dependencies
- 不新增后端服务。
- 不引入新全局状态库。

## Execution Path

### Phase 1: Data Contract
1. 明确字幕版本元数据结构与 active mapping 查询接口。
2. 补齐 repository API：
   - 列表摘要查询
   - 获取某单集版本列表
   - 设置 active 版本
   - 删除指定版本
   - 导出指定/全部版本
3. 将 `setActive` / `deleteVersion` / `fallbackActive` 收敛到 repository 单事务入口，禁止 UI 层直写表。

### Phase 2: UI Layer (Progressive Disclosure)
1. Downloads 卡片新增轻量摘要字段（版本数/当前版本/最近来源）。
2. 新增详情抽屉（或侧栏）承载版本管理动作：
   - 切换 active
   - 删除版本
   - 导出版本
3. 单版本自动降级显示策略落地。

### Phase 3: Behavior Integrity
1. 切换 active 后，播放器/阅读区必须立即读取新版本。
2. 删除 active 版本时执行确定性回退策略并刷新 UI。
3. 导出流程失败时给出可恢复提示，不影响播放。
4. 后台 ASR 在详情抽屉打开期间写入新版本时，不得覆盖用户刚手动选择的 active。

## Acceptance Criteria
1. Downloads 列表卡片复用 Files 页面的卡片结构与统一视觉语言。
2. 详情层（或卡片下方展开区域）可查看同一单集的多字幕版本并完成切换。
3. 运行时始终只存在一个 active subtitle；播放/阅读无歧义。
4. 支持导出单个版本和该单集全部版本。
5. 删除 active 版本后行为可预测（回退到最近可用版本；无可用版本则置空）且无坏链。
6. 单版本场景下 UI 自动简化，不暴露多版本复杂度。
7. Downloads 列表查询不读取字幕正文；100 条卡片摘要查询在本地环境下应保持可交互（建议阈值 `<100ms`）。

## Tests (Required)
- UI:
  - 列表卡片与 Files 重用一致的样式。
  - 卡片内操作（切换/删除/导出）可达且状态更新正确。
- Domain:
  - active subtitle 原子切换测试。
  - 删除 active 后回退策略测试。
  - 删除单个 track 时共享 subtitle 引用保护测试（另一 track 仍引用时不得删除 subtitle 实体）。
  - 导出指定/全部版本测试。
- Regression:
  - 播放链路在版本切换后读取最新 active 版本。
  - 手动切换 active 与后台 ASR 新版本写入并发时，手动选择保持生效。

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite build`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/downloadService.db.test.ts`
- `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/DownloadsPage*.test.tsx`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - Downloads list UI
  - Subtitle version repository
  - Transcript read/play mapping
- Regression risks:
  - active mapping 错乱导致播放字幕不一致
  - 列表性能退化（错误加载正文）
- Required verification:
  - 上述命令全部通过
  - 手动验证“多版本切换后播放一致”

## Decision Log
- Required: Yes.

## Bilingual Sync
- Required: Yes.
