---
description: Definitive contract for Reading Area artwork/CTA behavior when transcript content is not currently visible
---

# Instruction 020: Playback Artwork Transcript CTA Logic

# Task: 统一 Cloud Reading Area 在“当前未显示 transcript”时的 artwork + CTA 决策逻辑

## Objective

为 Cloud UI 的 Reading Area 建立一套**transcript-first**、可测试、可扩展的 artwork CTA 决策合同，确保：

1. 有 transcript 时优先引导“查看 transcript”，而不是“生成 transcript”
2. 没有 transcript 时才根据 ASR readiness 决定 CTA
3. normal play、stream-without-transcript、session restore、local download 等入口表现一致

## Decision Log

- **Required / Waived**: Required

## Bilingual Sync

- **Required / Not applicable**: Required

## 术语约定（必须统一）

本 instruction 明确采用：

- **领域对象 / 代码语义**：`transcript`
- **实现命名**：`transcriptUrl`, `hasTranscript`, `transcriptAvailable`, `showTranscript`

禁止在实现合同中继续以 `subtitle` 作为主语义对象。

说明：
- 如果 UI 文案最终仍保留某些历史 “字幕” 中文 copy，这属于 display copy 层决定
- 但本任务的**状态判断、selector、测试命名、review 语义**都必须使用 `transcript`

## 问题背景

当前 Reading Area 在 artwork view 下的 message / CTA 存在典型风险：

1. built-in transcript、cached/local transcript、ASR availability 可能被混在一起判断
2. 有 transcript 时仍可能错误地展示 “Generate Transcript”
3. 条件容易散落在组件 JSX 中，导致 favorite / history / restore / local download 表现不一致
4. `stream_without_transcript` 与 normal play 的职责边界容易混淆

## 核心原则

### 1. Transcript-first

只要当前 episode 对应的**任何合法 transcript source** 已经存在，就必须优先进入：

- `Transcript available`
- `Show Transcript`

而不是：

- `Generate Transcript`
- `Set up transcript generation`

### 2. CTA 只在 “Reading Area 当前未显示 transcript” 时参与

本任务只定义 artwork view 下的 CTA 行为。

如果 transcript 当前已经在 Reading Area 中显示：

- artwork/message/button 不应参与当前决策
- 不应闪现 CTA 再切走

### 2.1 `transcript source exists` 不等于 `transcript currently loaded`

本任务必须明确区分：

- `transcript source exists`
  - 当前 episode/track 存在可合法解析的 transcript 来源
- `transcript currently loaded`
  - 当前 transcript 已经进入 store / 当前 reading area 正在显示

`transcript_available_show` 可以在 “source exists but not yet loaded into visible reading area” 的情况下成立。

不得把“当前还没加载进 store”误判为“没有 transcript source”。

### 3. Playback readiness 与 transcript CTA 解耦

normal play 的音频播放不能因为 transcript CTA 逻辑而被阻塞。  
CTA 是 reading-area fallback / alternate surface 的状态，不得影响播放主链路。

对于 normal play：

- 如果 transcript-first 路径已命中
- 或 transcript ingestion 正在进行

则 artwork CTA 不得短暂闪出 `Generate Transcript` / `Set up transcript generation` 再被后续状态覆盖。

必须优先保证无闪烁、无错误中间态。

### 4. 与 Instruction 019 对齐

如果 built-in transcript 或其他 transcript source 已存在：

- 即使 ASR 已配置，也不能把 CTA 推成 `Generate Transcript`
- transcript fetch failure 也不能自动升级成 ASR CTA，除非当前确实不存在 transcript source 且用户不在 transcript-first 命中路径

### 5. 与 Instruction 016 对齐

如果涉及错误处理，必须与 016 的 error code 体系对齐。

### 6. 与 Instruction 015a-015b (Streaming Audio Cloud Fallback) 对齐

当流式播放 fallback 到 cloud proxy 时：
- fallback 本身不影响 transcript source 的判断
- CTA 逻辑保持不变，不因 fallback 触发而改变
- transcript-first 原则仍然适用

如果 session restore 命中 local download，且该 local track 存在 transcript：

- 必须按 local transcript available 处理
- 不得因为 session 原始来源是 remote 就误判为 “No transcript yet”

## CTA 决策 owner

本任务不得把复杂条件散落在 `ReadingContent.tsx` 的 JSX 分支中。  
必须收敛为一个**集中、可测试的 derived state**。

推荐形式：

- `deriveArtworkTranscriptCtaState(...)`
- 或等价 selector / pure helper

输入应至少包含：

- current playback mode
- transcript visibility state
- built-in transcript availability
- cached/local transcript availability
- ASR readiness
- transcript ingestion/loading state
- local track identity（如适用）

### 输入来源映射（必须明确）

selector 的每个输入必须来自明确的 store selector 或 prop，不得从 DOM 或瞬态状态读取：

| 输入 | 来源 |
|------|------|
| transcript visible | `useTranscriptStore` 的 `hasContent` + reading area mode |
| playback mode | `usePlayerSurfaceStore` 的 `mode` |
| built-in transcript availability | `episodeMetadata?.transcriptUrl`（非空且合法 URL） |
| cached/ingested transcript | transcript store / cache 命中当前 episode |
| ASR readiness | ASR store 的 `isConfigured` + `isReady` |
| transcript loading/generation state | transcript store 的 `isLoading` / `isGenerating` |
| localTrackId | `playerStore.localTrackId` |

### 当前 episode / track 命中键（必须明确）

cached / ingested / local transcript 是否属于“当前 episode”，不得使用 title、podcastTitle 等弱标识判断。

first-pass 应优先采用以下稳定 identity：

1. `episodeMetadata.originalAudioUrl`
2. `localTrackId`
3. transcript cache / DB 已存在的规范化 key

如实现使用等价 identity，必须保证 reviewer 可证明不会把其他 episode 的 transcript 误命中到当前 CTA 状态。

### `transcript visible` 的明确定义

"transcript 当前在 reading area 显示" 的判断标准：

- transcript store 有内容（`hasContent` 或等价的 cues 数组非空）
- reading area 当前处于 transcript 显示模式（不是 artwork view）
- 不是 `stream_without_transcript` 模式

不得依赖 DOM 可见性（`offsetParent`、`getBoundingClientRect`）或 CSS 状态。

### `loading_hidden` 状态的超时边界

如果 transcript ingestion / loading 超过 **超时阈值** 仍未完成：

- 不得无限期保持 `loading_hidden`
- 超时阈值建议提取为常量（如 `TRANSCRIPT_LOADING_TIMEOUT_MS`）或在运行时配置
- 默认建议值：15 秒（可调整）
- 超时期间不得闪出 CTA，应在超时后一次性切换状态

超时后的落点必须明确：

- 如果 transcript source 仍存在：
  - 若最近一次 fetch/load/ingest 明确失败或超时，优先切到 `transcript_available_retry`
  - 否则切到 `transcript_available_show`
- 只有在确认当前不存在任何 transcript source 时：
  - 才允许切到 `no_transcript_generate` 或 `no_transcript_setup`

### 与 `useAutoplayRetry` 的交互

如果 transcript loading 期间触发了 `useAutoplayRetry`（音频播放重试）：

- CTA 状态不受影响，继续按 transcript loading 路径
- 不得因为 autoplay retry 而重置或闪现 CTA
- transcript-first 决策独立于音频播放状态

输出应为稳定的状态枚举，而不是直接在组件里堆多层 if/else。

补充要求：

- selector / helper 必须保持 pure
- 不得在 selector 内触发：
  - fetch
  - navigation
  - ASR generation
  - transcript ingestion side effects
- selector 不得依赖 render 后 effect 才补齐的瞬态副作用作为唯一 truth source

## 允许的 transcript sources

本任务中的 “transcript available” 至少应覆盖：

1. **Built-in remote transcript**
   - 例如 `episodeMetadata?.transcriptUrl` 非空且合法

2. **Cached / ingested transcript**
   - 已经存在于 remote transcript cache 或既有 transcript store / DB 中

3. **Local downloaded transcript**
   - 与当前 `localTrackId` 绑定的本地 transcript

以下情况**不算 transcript available**：

- 仅仅 ASR ready
- transcript 仍未生成
- transcriptUrl 是空串 / 无效脏值
- 之前有 transcript 但当前 episode/track 实际未命中它

### `local transcript source exists` 的明确定义

以下情况必须算作 `local transcript source exists`：

- 当前 `localTrackId` 非空
- 且存储层（如 FilesRepository / DB / subtitle repository）可以命中与该 local track 绑定的 transcript
- 即使当前 transcript 还**没有**加载进 transcript store / Reading Area，也仍然算 `transcript source exists`

以下情况**不允许**作为 local transcript source 的唯一判断：

- `hasDisplaySubtitles`
- 当前 cues 是否已经渲染
- 当前 transcript 是否已经在 reading area 中可见

也就是说：

- `local transcript source exists`
  不等于
- `local transcript currently loaded`

worker 不得仅用 “localTrackId + 当前已有 display subtitles” 来近似判断 local transcript availability。

### `stream_without_transcript` 边界

`stream_without_transcript` 仅表示：

- 用户当前选择不自动显示 transcript
- 或当前播放模式是“纯听”

它**不表示**：

- transcript source 不存在
- transcript unavailable
- 可以把 CTA 降级为 `Generate Transcript`

## 明确状态枚举

建议至少收敛为以下 UI state：

1. `none`
   - transcript 已在 reading area 显示
   - artwork CTA 不参与

2. `loading_hidden`
   - normal play 下 transcript ingestion / loading 正在进行
   - artwork CTA 不应闪出

3. `transcript_available_show`
   - 当前 reading area 没显示 transcript
   - 但 episode/track 已有 transcript source
   - 显示：
     - message: `Transcript available`
     - CTA: `Show Transcript`

4. `transcript_available_retry`
   - 当前 reading area 没显示 transcript
   - transcript source exists
   - 但最近一次 transcript fetch / load / ingest 失败或超时
   - 显示：
     - message: `Transcript available`
     - CTA: `Retry Transcript`

5. `no_transcript_generate`
   - 当前无 transcript source
   - ASR ready
   - 显示：
     - message: `No transcript yet`
     - CTA: `Generate Transcript`

6. `no_transcript_setup`
   - 当前无 transcript source
   - ASR not ready
   - 显示：
     - message: `No transcript yet`
     - CTA: `Set up transcript generation`

实现者可以用不同命名，但语义必须一一对应。

## 场景合同

### Scenario A: Episode has built-in transcript

#### A1. Normal play
- transcript view 应优先显示
- artwork/message/button 不应成为主状态

#### A2. Stream without transcript
- 显示 artwork
- message: `Transcript available`
- CTA: `Show Transcript`

说明：
- 即使 ASR 已配置，也不得显示 `Generate Transcript`

### Scenario B: Episode has no built-in transcript, but transcript is already available from cache/local/download

#### B1. Normal play
- 如果当前 transcript view 正在显示：不显示 artwork CTA
- 如果当前 transcript 没显示：按 `transcript_available_show`

#### B2. Stream without transcript
- 显示 artwork
- message: `Transcript available`
- CTA: `Show Transcript`

### Scenario C: Episode has no transcript source, ASR is ready

#### C1. Normal play
- 如当前产品策略是自动 transcript generation / ingestion，则应显示 loading/processing state
- 在 transcript 正在加载/生成期间，不应短暂闪出 `Generate Transcript`

#### C2. Stream without transcript
- 显示 artwork
- message: `No transcript yet`
- CTA: `Generate Transcript`

### Scenario D: Episode has no transcript source, ASR is not ready

#### D1. Normal play
- 如果 reading area 当前没有 transcript，则显示 artwork + setup CTA

#### D2. Stream without transcript
- 显示 artwork
- message: `No transcript yet`
- CTA: `Set up transcript generation`

### Scenario E: Transcript source exists but fetch fails

#### E1. Normal play
- transcript fetch 失败不应阻止播放
- 不得把 `source exists but load failed` 误判为 `no transcript source`
- artwork CTA 应按 `transcript_available_retry` 或 `transcript_available_show` 处理

#### E2. Stream without transcript
- 显示 artwork
- message: `Transcript available` 或等价的可恢复文案
- CTA: `Show Transcript` 或 `Retry Transcript`

说明：
- transcript fetch 失败不自动触发 ASR
- 错误应有日志（与 Instruction 016 对齐）
- 只有在后续证据明确表明当前 episode/track 实际不存在任何 transcript source 时，才允许降级到 `no_transcript_generate` / `no_transcript_setup`

## 明确动作合同

### `Show Transcript`

职责：
- 恢复 transcript view
- 触发 transcript 显示路径，而不是重新生成 transcript

first-pass source resolution 顺序应明确且稳定：

1. 当前 store 中已存在、已匹配当前 track/episode 的 transcript
2. 与 `localTrackId` 绑定的 local/downloaded transcript
3. 已缓存/已 ingestion 的 transcript
4. built-in `transcriptUrl`

如实现采用不同内部顺序，必须保证用户可见行为等价且 reviewer 可验证不会错误降级为“无 transcript”。

允许的行为：
- remote built-in transcript: 调用既有 transcript ingest/load flow
- local transcript: 触发 reload / select / display flow

必须明确：

- built-in / remote transcript source:
  - `Show Transcript` 可以走 `autoIngestEpisodeTranscript(...)` 或等价 remote ingest path
- local/downloaded transcript source:
  - `Show Transcript` 必须走本地 transcript load/display path
  - 不得伪装成 remote transcript ingest
  - 不得因为 `transcriptUrl` 缺失而回退到 automatic ASR

如果当前实现需要 source-aware branching，必须显式按 transcript source type 分流，而不是把所有 `Show Transcript` 点击统一塞进一个 remote-only helper。

禁止：
- 点击 `Show Transcript` 时触发 ASR
- 点击 `Show Transcript` 时重新 full-audio download

### `Generate Transcript`

职责：
- 仅在当前确实无 transcript source 且 ASR ready 时，发起显式用户触发的 transcript generation

允许：
- `startOnlineASRForCurrentTrack('manual')` 或等价 explicit-user-action path

禁止：
- 在 transcript-first 命中时展示此按钮

### `Set up transcript generation`

职责：
- 跳转设置页面，帮助用户配置 ASR

允许：
- navigate to `/settings#asr`

禁止：
- 在点击前偷偷开始任何 transcript generation

## 实现 checklist

### ReadingContent / selector layer

- [ ] 不在 JSX 中散落复杂多分支决策
- [ ] 新增或收敛到集中 selector / pure helper
- [ ] selector 保持 pure，无 side effects
- [ ] selector 输入覆盖：
  - [ ] transcript visible
  - [ ] playback mode
  - [ ] built-in transcript availability
  - [ ] cached/local transcript availability
  - [ ] ASR readiness
  - [ ] transcript loading/generation state
  - [ ] localTrackId / restore-local-download context

### Transcript availability

- [ ] built-in transcript: 基于合法 `transcriptUrl`
- [ ] cached/ingested transcript: 基于既有 store / DB 命中
- [ ] local transcript: 基于 `localTrackId`
- [ ] 不把 “ASR ready” 误算为 transcript available
- [ ] 不把 “当前未加载进 store” 误算为 no transcript source
- [ ] 不把 `stream_without_transcript` 误算为 no transcript source

### CTA actions

- [ ] `Show Transcript` 只恢复 transcript view / load transcript，不触发 ASR
- [ ] `Generate Transcript` 只在 manual path 触发
- [ ] `Set up transcript generation` 只导航设置页

## Required localization keys

推荐统一为 transcript wording：

- `transcriptAvailable`
  - EN: `Transcript available`
  - ZH: `此节目已有 transcript`

- `showTranscript`
  - EN: `Show Transcript`
  - ZH: `查看 transcript`

- `noTranscript`
  - EN: `No transcript yet`
  - ZH: `暂无 transcript`

- `asrGenerateTranscript`
  - EN: `Generate Transcript`
  - ZH: `生成 transcript`

- `asrSetupTranscriptGeneration`
  - EN: `Set up transcript generation`
  - ZH: `设置 transcript 生成`

- `pureListeningMode`
  - EN: `Pure listening mode`
  - ZH: `纯听模式`

如果产品最终决定中文仍显示“字幕/文本”，实现者可以在文案层调整，但：

- key 语义
- selector contract
- review 说明

仍应以 `transcript` 为准。

补充要求：

- 新的 CTA/message 决策逻辑不得依赖旧 `subtitle*` 语义 key 作为领域判断
- 如果最终 display copy 继续显示“字幕”，也必须是由 transcript 语义映射而来，而不是实现层回退到 subtitle 语义
- 域模型、selector、测试命名统一使用 `transcript`
- 用户文案可以使用更自然的产品表达，如：
  - `文本`
  - `转写文本`
  - `逐字稿`
  前提是实现语义仍是 `transcript`

## 测试矩阵（必须补）

至少覆盖以下情况：

1. built-in transcript + normal play
   - 不显示 artwork CTA

2. built-in transcript + stream_without_transcript
   - 显示 `Transcript available` + `Show Transcript`

3. no built-in transcript + cached/local transcript exists
   - 显示 `Transcript available` + `Show Transcript`

4. no transcript source + ASR ready + stream_without_transcript
   - 显示 `No transcript yet` + `Generate Transcript`

5. no transcript source + ASR not ready
   - 显示 `No transcript yet` + `Set up transcript generation`

6. transcript loading / ingestion pending in normal play
   - 不应闪出 `Generate Transcript`

7. restore from local download with transcript
   - 按 transcript available 处理
   - 即使 transcript 尚未加载进 store，也不得误显示 `Generate Transcript`

8. local/downloaded transcript exists but is not yet loaded into reading area
   - 仍显示 `Transcript available` + `Show Transcript`
   - 不得把 availability 绑定到 `hasDisplaySubtitles`

9. local/downloaded transcript CTA click
   - 必须走 local transcript load/display path
   - 不得触发 automatic ASR

10. transcript-first hit + ASR configured
   - 仍不得出现 `Generate Transcript`

11. transcript fetch failed but transcript-first contract still applies
   - 不得错误翻转为 automatic ASR CTA
   - 应落到 `transcript_available_retry` / `transcript_available_show`

12. restored remote session with cached/ingested transcript
   - 按 transcript available 处理

13. `stream_without_transcript` + transcript source exists
    - 不得因为 pure listening mode 误显示 `Generate Transcript`

14. streaming audio fallback to cloud proxy occurs
    - CTA 逻辑保持不变，不因 fallback 改变

13. action side effects
    - `Show Transcript` / `Retry Transcript` 不触发 manual ASR
    - `Generate Transcript` 不触发设置页导航
    - `Set up transcript generation` 不触发 transcript load / ASR

## Review focus

Reviewer 必须重点检查：

1. 是否统一使用 `transcript` 作为领域语义
2. 是否把 CTA 决策收敛成集中 selector，而不是 JSX 散落条件
3. 有 transcript 时是否仍可能错误显示 `Generate Transcript`
4. 是否与 `019` 的 transcript-first contract 对齐
5. 是否与 `018` 的 local-download restore contract 对齐
6. 是否与 `015a-015b` 的 streaming audio fallback 对齐
7. normal play 的 loading state 是否被 CTA 逻辑打断或闪烁
8. 错误处理是否与 `016` 的 error code 体系对齐（如有相关错误码）
9. local/downloaded transcript source 是否在“尚未加载进 store”时也能被正确识别
10. `Show Transcript` 是否按 source type 正确分流，而不是把 local path 错接到 remote ingest / ASR

## Failed-attempt correction (mandatory for next execution pass)

上一轮实现出现了两个阻塞性偏差；下一轮执行必须先纠正这两个点，再讨论其余优化：

### A. Playback 主链路不得被 transcript preload 阻塞

禁止以下实现形态：

- 在 `remotePlayback` 的 normal play 主链路中
- 先 `await loadRemoteTranscriptWithCache(...)`
- 再 `setAudioUrl(...)` / `play()`

原因：

- 这会把 transcript fetch 变成播放启动前置条件
- 违反本 instruction 的 “Playback readiness 与 transcript CTA 解耦”
- 会在慢 transcript host 下制造错误 loading / CTA 中间态

下一轮必须满足：

- source resolution 成功后，normal play 仍按既有播放主链路启动
- transcript load/fetch 可以并行或后置，但不得成为播放 gate
- transcript fetch 失败时，只能影响 CTA / transcript surface 状态，不能阻塞音频播放

### B. CTA 决策必须提炼成 pure helper，不得继续内嵌在 `ReadingContent.tsx`

禁止以下实现形态：

- 继续在 `ReadingContent.tsx` JSX 中直接堆叠多层条件
- 继续只用 `episodeMetadata?.transcriptUrl` 作为 transcript available 的主判断

下一轮必须满足：

- 抽出单一 pure helper / selector（例如 `deriveArtworkTranscriptCtaState(...)`）
- `ReadingContent.tsx` 只消费 helper 输出状态，不重新实现决策
- helper 输入至少覆盖：
  - transcript visible / loaded
  - transcript ingestion status / error
  - playback request mode
  - built-in transcript source
  - local/download restore context（至少 `localTrackId` + 当前已加载 transcript cues 这条现实可验证路径）
  - ASR readiness

### C. Execution sizing for the next pass

下一轮执行只允许聚焦以下 changed zone：

- `apps/cloud-ui/src/components/AppShell/ReadingContent.tsx`
- 新增或相邻的 CTA helper / selector 文件
- `apps/cloud-ui/src/lib/player/remotePlayback.ts`
- 与上述 changed zone 直接相关的 focused tests

明确不做：

- backend / proxy / relay 逻辑修改
- 大范围 i18n key 重命名
- technical roadmap 更新
- instruction completion 标记（直到 reviewer approve）

## Non-goals

本任务不要求：

1. 重写 transcript ingestion backend
2. 修改 `/api/proxy` 或 ASR relay transport
3. 大改 player UI 结构
4. 引入新的 transcript storage schema

## Verification

- 运行相关 Reading Area / player / transcript CTA focused tests
- changed zone 应至少覆盖：
  - `ReadingContent`
  - CTA selector/helper
  - transcript/playback CTA tests
- 手工验证：
  - built-in transcript episode
  - no-transcript + ASR-ready episode
  - no-transcript + ASR-not-ready episode
  - restored local-download episode
- 明确验证 action contract：
  - `Show Transcript` / `Retry Transcript` 不调用 `startOnlineASRForCurrentTrack('manual')`
  - `Generate Transcript` 不导航 `/settings#asr`
  - `Set up transcript generation` 不触发 transcript load / ASR

### Required commands for the next execution pass

下一轮执行完成前，至少必须跑通：

- `pnpm -C apps/cloud-ui exec vitest run src/components/AppShell/__tests__/FullPlayer.controls.test.tsx src/components/AppShell/__tests__/DockedPlayer.controls.test.tsx src/lib/player/__tests__/remotePlayback.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
- `pnpm -C apps/cloud-ui lint`
- `pnpm -C apps/cloud-ui typecheck`

## Completion

- **Completed by**:
- **Commands**:
- **Date**: 2026-04-07
- **Reviewed by**:

When finished: append `[COMPLETED]` to the H1 and fill Completion fields.
