# Instruction 125c: Subtitle Storage Refactor (JSON SSOT)

## Hard Dependencies
- Instruction 125 must be completed.
- Instruction 125b must be completed.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/asr-pipeline.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/asr-pipeline.zh.mdx`

## Goal
将字幕持久化收敛为 JSON 单一真相（SSOT），避免同一字幕在数据库中同时保存长文本与结构化数据的双轨状态。  
最终行为：
- 入库统一为结构化 cue 数据（JSON）。
- 播放/阅读直接消费结构化数据。
- 仅在“导出/浏览器 `<track>`”时按需生成 SRT/VTT 字符串，不做长期持久化。

## Product Decisions (Locked)
1. 持久层字幕真相字段为结构化 JSON（对应 `ASRCue[]` 语义），不是 SRT/VTT 长文本。
2. `subtitles` / `remote_transcripts` 禁止新增“双写”策略（同一条记录不再维护两份等价正文）。
3. 字级信息（`words[]`）必须可保留，不允许因格式转换丢失。
4. 运行时转换函数集中在单一 codec 模块，禁止多处重复实现。
5. 首次开发发布策略：不做历史数据迁移/兼容回填，不写 migration script。
   - 明确前提：项目尚未上线，无生产历史数据。
   - 本地验证统一使用“清空浏览器站点数据/清库”作为唯一基线。
6. 导出能力保留：用户导出时现场生成 SRT/VTT；UI 播放若需 `<track>` 也现场生成并及时 revoke。
7. 结构化字幕序列化必须稳定（canonical），并引入显式 schema version 字段，保障去重与未来演进。
8. 解析失败时必须 fail-closed：不得写入空 cues 伪成功记录；必须返回错误并保持可恢复路径。
9. `remote_transcripts` 完全移除 `rawContent`，仅保留结构化 cues 与必要元数据。
10. `PlaybackSession.subtitleType` 完全移除，不再保留格式快照字段。
11. 本次重构不改变 125b 的交互层决策：
   - Downloads 页面继续复用 Files 页面同源卡片体系。
   - 本指令仅调整字幕存储与读取链路，不引入新的页面交互层级分歧。
12. Vault contract 必须同步升级：
   - bump `VAULT_VERSION`。
   - 导入时允许忽略 legacy 字段（`rawContent` / `rawAsrData` / `subtitleType`）。
   - 导出时禁止再输出上述 legacy 字段。
   - 该约束属于“导入容错”，不构成运行时旧数据兼容或迁移分支。

## Data Contract (Required)
- 结构化字幕持久层字段（最低约束）：
  - `cues: ASRCue[]`（结构化数组，作为持久层真相）
  - `cueSchemaVersion: number`（显式 schema version，当前版本固定为 `1`）
  - `asrFingerprint?: string`
  - `language?: string`
  - `provider?: string`
  - `model?: string`
- `cues` 语义约束：
  - 反序列化后必须为 `ASRCue[]` 语义结构（含可选 `words[]`）。
  - 空数组不得作为“成功转译结果”写入 `ready` 记录。
- `cueSchemaVersion` 演进约束：
  - forward-only（仅面向未来版本升级）。
  - 不承担历史旧格式读取兼容（与首次发布策略一致）。
- 字段映射（必须明确落地）：
  - `subtitles`：
    - 删除：`content`、`rawAsrData`
    - 新增/保留：`cues`、`cueSchemaVersion`、`asrFingerprint`、`storedAt`、`filename`
  - `remote_transcripts`：
    - 删除：`rawContent`
    - 新增/保留：`cues`、`cueSchemaVersion`、`asrFingerprint`、`url`、`fetchedAt`
  - `local_subtitles`：
    - 继续仅存版本元数据与引用（`subtitleId` + metadata），不存正文副本。

## Scope
- `apps/lite/src/lib/db/types.ts`
- `apps/lite/src/lib/dexieDb.ts`
- `apps/lite/src/lib/remoteTranscript.ts`
- `apps/lite/src/lib/subtitles.ts`
- `apps/lite/src/lib/asr/*`
- `apps/lite/src/lib/repositories/FilesRepository.ts`
- `apps/lite/src/lib/repositories/DownloadsRepository.ts`
- `apps/lite/src/lib/repositories/PlaybackRepository.ts`
- `apps/lite/src/lib/files/ingest.ts`
- `apps/lite/src/hooks/useFilePlayback.ts`
- `apps/lite/src/store/playerStore.ts`
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- `apps/lite/src/lib/vault.ts`
- `apps/lite/src/store/historyStore.ts`
- `apps/lite/src/routeComponents/HistoryPage.tsx`
- `apps/lite/src/routeComponents/__tests__/HistoryPage*.test.tsx`
- `apps/lite/src/components/Transcript/*`
- `apps/lite/src/components/Downloads/*`
- `apps/lite/src/lib/__tests__/*`
- `apps/lite/src/components/**/__tests__/*`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/asr-pipeline.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/asr-pipeline.zh.mdx`

## Scope Scan (8 Scopes)
- Config:
  - 无新增 runtime config。
- Persistence:
  - 字幕实体需落在单一 JSON 结构，避免冗余存储。
- Routing:
  - 无路由改动。
- Logging:
  - 仅记录解析失败/导出失败，禁止噪声日志。
- Network:
  - 无新增后端接口。
  - 远端 transcript 抓取只负责一次性解析输入；成功后仅持久化结构化 cues，不保留长文本原文副本。
- Storage:
  - 需要验证 DB 空间占用下降，且无孤儿字幕引用。
  - 存储统计/配额口径必须与新字段一致（避免继续双计 content + rawAsrData）。
- UI state:
  - 播放与阅读消费链路改为结构化数据直读，状态机语义不变。
- Tests:
  - 必须覆盖 ingest、persist、read、export 四段链路。

## Hidden Risk Sweep
- Async control flow:
  - ASR 并发写入与 active subtitle 切换不能互相覆盖错误状态。
- Hot path performance:
  - 渲染热路径禁止反复 parse 大字符串；应复用已解析结构。
  - on-demand 导出/`<track>` 生成需受控（memo + URL 生命周期），避免重复生成与内存泄漏。
- State transition integrity:
  - `transcriptIngestionStatus` 不得因 codec 失败卡在不可恢复状态。
- Dynamic context consistency:
  - 切换字幕版本后，阅读区与播放器必须读取同一 active 版本（同一数据源）。

## Required Patterns
- Subtitle codec SSOT:
  - 建立统一接口（例如 `normalizeCues` / `serializeCuesCanonical` / `cuesToSrt` / `cuesToVtt`）。
  - `serializeCues` 输出需稳定（字段顺序、数值精度策略固定）以支撑 fingerprint 一致性。
- API naming clarity:
  - 禁止继续使用歧义签名（例如 `addSubtitle(content, ...)`）。
  - 新增 API 命名需显式区分：结构化写入 vs 文本导入（例如 `addSubtitleCues`、`importSubtitleText`）。
- Repository SSOT:
  - 播放层只能通过 repository 读取 active subtitle，不得绕过。
- Fail-closed parsing:
  - 遇到损坏 JSON 必须返回可诊断错误并走可恢复路径，不可静默污染状态。
- On-demand export:
  - SRT/VTT 仅在导出与 `<track>` 需要时生成，禁止回写持久层。
- External transcript ingest contract:
  - 外部 transcript（SRT/VTT/JSON）仅作为输入格式参与一次解析，成功后仅持久化结构化 cues。
  - 解析失败必须 fail-closed，并保留可重试路径（不得写入伪 `ready` 记录）。

## Forbidden Dependencies
- 不引入 ffmpeg/wasm 字幕处理依赖。
- 不引入新的全局状态管理库。
- 不新增“兼容旧 schema”的临时分支代码。

## Execution Path

### Phase 1: Data Contract
1. 明确统一字幕结构（与 `ASRCue` 对齐，含可选 `words`）。
2. 在类型层和 DB access 层明确“结构化字段为真相，文本字段非持久真相”。
3. 增加字幕 schema version（例如 `cueSchemaVersion`）并定义升级策略。
   - 升级策略限定为 forward-only（仅面向未来版本演进），不承担旧格式读取兼容。
4. 删除或标记废弃所有“以长文本作为主输入”的持久化入口。
5. 从数据模型中移除 `remote_transcripts.rawContent` 与 `PlaybackSession.subtitleType`。
6. 同步移除影响面引用：
   - `vault` 导入导出 schema/序列化
   - history 相关模型与测试 fixture
   - 依赖 `subtitleType` 的 selector / 展示逻辑 / validator

### Phase 2: Persistence Refactor
1. 改造写入链路：
   - ASR 结果直接结构化入库。
   - 外部 SRT/VTT 导入后立即解析为结构化数据再入库。
   - 解析失败写入 `failed` 状态到“字幕版本元数据记录”（version metadata），不得写入空 cues 伪造 `ready`。
   - 解析失败不得变更 active subtitle 映射。
2. 改造读取链路：
   - 播放/阅读默认读取结构化数据。
   - 仅在导出时调用 codec 生成 SRT/VTT。
3. 清理冗余工具函数与重复转换代码，避免 partial migration。
4. 清理残留旧入口：
   - 禁止继续使用“长文本直存”作为主路径（例如 `DB.addSubtitle(content, ...)` 语义入口）。
   - 禁止播放/阅读链路直接 `parseSubtitles(xxx.content)` 读取持久层正文。
   - 禁止新增/保留 `rawContent` 或 `subtitleType` 相关读写路径。

### Phase 3: Playback/Reading Integrity
1. `remoteTranscript` 与 Files/Downloads repository 统一读取规则。
2. active subtitle 解析失败时，必须有确定性 fallback（ready + createdAt desc）。
3. 切换版本后阅读区与播放器同步生效，不允许分裂状态。
4. 现场生成 `<track>` URL 必须在切换/卸载时 revoke，避免 object URL 泄漏。

### Phase 4: Docs and Governance Sync
1. 更新 handoff 文档，明确“JSON SSOT + 按需导出”。
2. 文档中的字段名、表名、函数名必须与代码一致。
3. 同步中英文文档（`.mdx` + `.zh.mdx`）。

## Acceptance Criteria
1. 新增/更新字幕数据不再做 SRT/VTT 持久化双写。
2. 播放与阅读链路直接消费结构化字幕，无重复正则解析热点。
3. 导出 SRT/VTT 功能可用且与 active 版本一致。
4. active subtitle 切换、删除、回退语义保持 125b 既有约束不退化。
5. 无历史迁移脚本，无兼容旧数据分支。
5.1 执行与验收均以“全新数据基线”为前提（清空浏览器站点数据后验证）。
6. 相关 handoff 文档已同步，且中英文一致。
7. 存储统计与配额口径已切换到新字段，不存在旧字段残留统计误差。
8. fingerprint 在同一 cues 语义下稳定一致（不因对象序或浮点格式产生抖动）。
9. 代码库中不存在旧主路径残留（见 Verification 的 grep gate）。
10. 代码库中不存在 `rawContent` 与 `subtitleType` 的读写引用（测试 fixture 除外）。

## Tests (Required)
- Domain:
  - codec：`cues -> srt/vtt -> parse` 基本往返正确性。
  - codec：明确断言 `words[]` 保真仅在 JSON 持久层；SRT/VTT 往返不要求保留 `words[]`。
  - repository：active 读取、fallback 顺序、损坏 JSON 处理。
  - fingerprint：同一 cues 多次序列化 hash 一致。
- Integration:
  - ASR 入库后播放可直接读取结构化字幕。
  - Downloads/Files 切换字幕版本后阅读区同步。
  - 导出文件内容与当前 active 版本一致。
  - `<track>` object URL 在切换/卸载后正确释放。
- Mandatory new tests (must add):
  - 损坏 `cues` 时 fail-closed，并按 `ready + createdAt desc` 回退到下一个可用版本。
  - 同一语义 `ASRCue[]` 在重复序列化下 fingerprint 稳定一致。
  - `<track>` object URL 生命周期：生成、替换、卸载时均正确 revoke。
  - vault 导入含 legacy 字段不失败，导出不再包含 legacy 字段。
- Regression:
  - History/Search/Explore 进入播放后字幕加载行为不退化。
  - 并发场景下不出现“播放器有字幕、阅读区无字幕”分裂。
  - 存储统计页/配额警告与实际占用一致。

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite build`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscript*.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/DownloadsRepository.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/FilesRepository.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/storageQuota*.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/vault*.test.ts`
- `pnpm -C apps/lite test:run`
- `bash -lc "if rg -n '\\b(rawContent|rawAsrData|subtitleType)\\b' apps/lite/src --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy subtitle fields found' && exit 1; fi"`
- `bash -lc "if rg -n 'parseSubtitles\\([^\\)]*\\.content\\)' apps/lite/src --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy persisted-content parse path found' && exit 1; fi"`
- `bash -lc "if rg -n 'DB\\.addSubtitle\\([^\\)]*content' apps/lite/src --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy DB.addSubtitle(content,...) path found' && exit 1; fi"`

## Impact Checklist
- Affected modules:
  - Subtitle codec / DB contract / repository read path / transcript rendering
- Regression risks:
  - active fallback 逻辑丢失
  - 导出格式偏差导致外部播放器不兼容
  - 结构化字段损坏导致字幕空白
  - 配额统计残留旧字段导致错误告警
- Required verification:
  - 上述命令全部通过
  - 手动前置：清空浏览器站点数据（Application/Storage clear site data）
  - 手动验证：Downloads 与 Files 各一条多版本字幕切换 + 导出

## Decision Log
- Required: Yes.
- Must append one entry to `apps/docs/content/docs/general/decision-log.mdx`:
  - 为什么采用 JSON SSOT 而不是文本+JSON 双存储
  - 风险与回滚边界（导出失败、解析失败、fallback 策略）

## Bilingual Sync
- Required: Yes.
- Must update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/asr-pipeline.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/asr-pipeline.zh.mdx`
