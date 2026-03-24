# Readio STT Models Guide 2026 (Dual Track)

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/general/technical-roadmap.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `agent/instructions/lite/completed/instruction-123-online-asr-api-integration.md`
- `agent/instructions/lite/124-fundamental-downloads.md`
- `agent/instructions/lite/125-background-asr-transcription.md`

## Goal
本文件同时保留并指导两条 STT 路线：
1. **Part A（当前已实现）**：离线下载后 ASR（Instruction 124 + 125）。
2. **Part B（未来规划）**：在线播放实时 ASR（Realtime/Streaming）蓝图。

禁止将 Part A 视为“待替换旧方案”；Part A 与 Part B 是并行互补，不是互斥迁移。

---

## Part A: Current Guide (Implemented, Authoritative Offline ASR)

### A1. What Is Already Implemented
1. Instruction 124: 下载与本地音频持久化（IndexedDB）。
2. Instruction 125: 基于本地 blob 的后台 ASR（分块、队列、去重、持久化）。
3. 权威字幕来源：`local_download_blob`（下载后本地音频）。

### A2. Why This Path Is Required
核心原因：在线播放音频可能存在动态广告注入，下载后音频可能是不同字节流。
若 ASR 与播放音频不是同源，时间轴会漂移。
Part A 通过“下载音频 = 转写音频 = 播放音频”保证最高对齐稳定性。

### A3. Locked Contracts (Do Not Weaken)
1. 离线权威 ASR 输入必须来自本地 blob，不允许回退远程音频重转写。
2. 背景 ASR 失败不阻断播放。
3. 分块是顺序处理（无并行 fan-out）。
4. `offline` 产物是阅读/查词/高亮的权威时间基。
5. 与 124/125 的容量、队列、状态、错误语义保持一致。

### A4. Operational Notes
1. 实现优先级：稳定性 > 速度 > 成本。
2. 若与实时字幕冲突，离线权威字幕优先。
3. Docs 同步必须持续维护在：
   - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
   - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

---

## Part B: Future Guide (Realtime ASR Blueprint)

### B1. Product Objective
在不破坏 Part A 的前提下，新增“在线预览字幕”：
1. 用户进入在线播放后，快速看到可读字幕（低延迟）。
2. 允许精度低于 Part A，但必须可控、可回退、可停止。
3. 下载并完成离线 ASR 后，自动切换为权威字幕。

### B2. Research Snapshot (As of February 22, 2026)
实施前必须二次核验官方文档与价格。

| Provider | 角色定位 | 已确认信息（官方） | 建议 |
| --- | --- | --- | --- |
| OpenAI | Realtime 预览主候选 | Realtime Transcription 支持 `gpt-4o-transcribe` / `gpt-4o-mini-transcribe` | 先用作 Part B 首发 |
| Groq | 离线批处理主路径 | OpenAI-compatible transcription，`whisper-large-v3-turbo`，文件上限 100MB | 继续用于 Part A |
| Google Cloud STT | 企业备选 | `recognize` / `longrunningrecognize` / `streamingrecognize` | 非 Lite 首选 |
| Deepgram | Realtime 替代候选 | Nova-3 / Flux 模型分工清晰 | 作为 OpenAI 备选 |
| AWS/Azure | 企业采购备选 | 流式与批处理能力完整 | 后续企业化阶段评估 |
| Self-hosted (`faster-whisper`) | 数据主权/降本 | 适合后台批量任务 | 进入 v2 后端阶段 |

### B3. Architecture Contract (Realtime Must Follow)

#### B3.1 Source Contract
1. `preview_transcript` 来源：`remote_stream`，短生命周期。
2. `authoritative_transcript` 来源：`local_download_blob`，持久化。
3. 两者必须区分 `sourceKind` 与 `sourceFingerprint`。

#### B3.2 State Contract
每 track 独立维护：
- `preview`: `idle | buffering | transcribing | ready | failed`
- `offline`: `idle | queued | transcribing | ready | failed`

状态展示规则：
1. `offline=ready` 永远覆盖 `preview=ready`。
2. `offline=failed` 可继续展示 `preview`，并标注“非最终字幕”。
3. 任何失败都不能把播放器置于不可恢复状态。

#### B3.3 Timeline Contract
1. `preview` 允许轻微漂移，用于即时阅读辅助。
2. `offline` 为权威时间轴，作为查词/高亮/阅读跟随唯一时基。

### B4. Scope (Future Work)
- `apps/lite/src/lib/asr/*`
- `apps/lite/src/lib/remoteTranscript.ts`
- `apps/lite/src/store/playerStore.ts`
- `apps/lite/src/hooks/*`（仅 ASR 状态消费相关）
- `apps/lite/src/components/*`（仅字幕状态展示相关）
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`

### B5. Scope Scan (8 Scopes)
- Config:
  - 新增 realtime provider/model/timeout/reconnect 配置。
- Persistence:
  - preview 不写权威映射。
- Routing:
  - 不新增路由。
- Logging:
  - 记录 provider/model/latency/error-code；禁止敏感信息。
- Network:
  - preview 走 realtime；offline 保持 local blob + ASR API。
- Storage:
  - preview 只做短 TTL 缓存。
- UI state:
  - 必须清楚区分 preview 与 authoritative。
- Tests:
  - 竞态、晋升、失败回退、取消重连覆盖完整。

### B6. Hidden Risk Sweep (Realtime)
1. 旧 track 请求回写新 track（竞态污染）。
2. preview 覆盖 offline 权威结果（状态污染）。
3. 高频字幕事件阻塞主线程（性能抖动）。
4. 长音频实时转写成本不可控（预算失控）。

### B7. Step-by-step Execution Path

#### Phase 1: Benchmark Baseline
1. 建立统一数据集：多人对话、强口音、片头广告场景。
2. 指标定义：
   - `TTFC`（time-to-first-caption）
   - `P95 update latency`
   - `hourly ASR cost`
   - `timeline drift @ 10min`

#### Phase 2: Realtime Preview (Single Provider First)
1. 先接 OpenAI Realtime transcription。
2. 默认模型：`gpt-4o-mini-transcribe`（保留切换 `gpt-4o-transcribe`）。
3. 支持取消/重连/超时，track 切换时必须失效旧请求。

#### Phase 3: Promotion to Authoritative Offline
1. 保持 Part A 为权威路径，不修改其语义。
2. 当离线 ASR 成功时，执行原子晋升：替换阅读数据源 + 更新持久映射。
3. preview 仅保留为临时层，不得抢占权威层。

#### Phase 4: Cost Guardrails
1. 增加单会话预算（时长或费用）。
2. 超预算自动停止 preview，并提示等待离线权威字幕。
3. 输出成本日志，为后续 instruction 优化提供依据。

### B8. Acceptance Criteria (Future)
1. 在线播放可在目标延迟内出现 preview 字幕。
2. 离线 ASR 成功后自动晋升为权威字幕。
3. 权威字幕与本地播放音频稳定对齐。
4. preview/offline 任一路径失败都不阻断播放与基础阅读。
5. Docked/Full/普通阅读区语义一致。

### B9. Tests (Future Required)
- Unit:
  - preview/offline 状态机与覆盖规则。
  - adapter 错误映射、取消、超时。
- Integration:
  - “preview -> offline 晋升”全链路。
  - 快速切 track 的请求失效保护。
- Regression:
  - 不退化 123/124/125 已有行为。

### B10. Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`

---

## Decision Log
- Required: Yes.
- 必须在 `apps/docs/content/docs/general/decision-log.mdx` 记录：
  1. 为什么实时预览选该 provider。
  2. 为什么离线权威继续使用 124/125 体系。
  3. 风险、回滚与停用策略。

## Bilingual Sync
- Required: Yes.
- 同步更新：
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## References (Primary Sources)
- OpenAI Realtime Transcription: https://platform.openai.com/docs/guides/realtime-transcription
- OpenAI Speech-to-Text: https://platform.openai.com/docs/guides/speech-to-text
- OpenAI Pricing: https://openai.com/bn-BD/api/pricing/
- Groq Speech-to-Text: https://console.groq.com/docs/speech-to-text
- Groq Pricing: https://groq.com/pricing/
- Google STT Requests: https://cloud.google.com/speech-to-text/docs/speech-to-text-requests
- Google Streaming Recognize: https://cloud.google.com/speech-to-text/docs/streaming-recognize
- Deepgram Models Overview: https://developers.deepgram.com/docs/models-languages-overview
- AWS Transcribe Docs: https://docs.aws.amazon.com/transcribe/
- Azure AI Speech Docs: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/
- faster-whisper Repo: https://github.com/SYSTRAN/faster-whisper
