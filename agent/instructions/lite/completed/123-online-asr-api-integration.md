# Instruction 123: Online ASR API Integration (Groq) [COMPLETED]

## Hard Dependencies
- **Instruction 122 (Settings/Credentials Split)** must be fully implemented before starting this task. This instruction depends on the `credentials` table and `CredentialsRepository` API introduced in 122 for secure API Key storage.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `agent/instructions/lite/plans/stt_models_guide_2026.md`
- `agent/instructions/lite/122-settings-and-credentials-storage-strategy-split.md`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`

## Goal
Implement online ASR (Automatic Speech Recognition) using the Groq API (Whisper-v3-Turbo) to provide real-time transcription for audio content (Explore episodes or uploaded files) that lacks subtitles.

## Deployment Constraints (Hard Rules)
- **Public Lite**: Strictly **BYOK**. Users must input their own API Key in Settings.
- **Self-host Docker**: Allows `env.js` runtime injection for Private Instances.
- **Prohibition**: NEVER embed a "Platform Shared Key" as a default in the frontend build for public access.

## Key Precedence (Immutable)
1. **IndexedDB** (`credentials` table) - authoritative source.
2. **Runtime Env** (`READIO_GROQ_API_KEY`) - fallback only if DB is empty.
3. **Empty** - if neither exists.
*Rule*: Once a user saves a key in Settings (writing to DB), the DB value takes precedence forever. Env vars never overwrite user DB settings.

## Scope
- `apps/lite/src/lib/asr/*` (New feature module)
- `apps/lite/src/lib/asr/types.ts` (ASR-specific data types)
- `apps/lite/src/features/settings/*` (Settings UI and logic)
- `apps/lite/src/store/playerStore.ts` (State for ASR status + abort control)
- `apps/lite/src/lib/remoteTranscript.ts` (Trigger logic)
- `apps/lite/src/lib/dexieDb.ts` (Persisted transcript contract update)
- `apps/lite/src/lib/schemas/settings.ts` (Schema update)
- `apps/lite/src/hooks/useSettingsForm.ts`
- `apps/lite/src/hooks/useSettingsData.ts`
- `apps/lite/src/lib/db/types.ts` (Transcript + credentials schema)
- `apps/lite/src/lib/__tests__/asr/*` (New)
- `apps/lite/src/store/__tests__/*` (ASR state transition coverage)

## Scope Scan (8 Scopes)
- **Config**: Add `asrProvider`, `asrModel` to settings. In Instruction 123, provider is fixed to `groq` only (no runtime OpenAI path).
- **Persistence**: Save generated transcripts to `remote_transcripts` (podcasts) or `subtitles` (files). Persist full word-level `ASRCue[]` JSON in `rawAsrData` for both paths.
- **Routing**: No changes.
- **Logging**: Log ASR events (start, success, fail, abort, chunk progress) but NEVER log API keys.
- **Network**: Integration with Groq API (`https://api.groq.com/openai/v1/audio/transcriptions`). All in-flight requests must be cancellable via `AbortController`. ASR requests are direct browser → Groq calls (do not route through RSS/iTunes proxy chain).
- **Storage**: Store Groq API Key in the `credentials` table (introduced in Instruction 122).
- **UI state**: Add `transcribing` status to player UI; add `abortAsrController` to playerStore. Define deterministic terminal transitions for success/fail/abort/track-switch.
- **Tests**: Unit tests for ASR client, chunking logic, and integration tests for transcription trigger.

## Hidden Risk Sweep
- **Cost/Quota**: Groq is fast but has rate limits and potential costs. Implement a "Verification" button and clear error messaging for 429/401.
- **File Size**: Groq API has a 25MB upload limit. A 1-hour 128kbps MP3 is ~56MB. Implement client-side chunking (Phase 1) to split audio into segments < 20MB, transcribe sequentially, and stitch results. See §Plan Step 2b for details.
- **Privacy**: User must explicitly enable ASR and provide a key. No "Auto-upload" by default.
- **Race Conditions**: Handle track switching during transcription by storing an `AbortController` reference in `playerStore`. On track switch, call `.abort()` to cancel the HTTP request immediately, saving API quota.
- **Data Contract Gap**: The existing `subtitle[]` type (`{ start, end, text }`) lacks word-level fields. Define an extended `ASRCue` type to preserve raw detail while remaining backward-compatible for rendering. See §Data Types.
- **Runtime Consistency**: Startup hydration must resolve credential source before ASR trigger path reads keys; do not start ASR until settings + credentials are loaded.

## Data Types

```typescript
// apps/lite/src/lib/asr/types.ts

/** Word-level timestamp from ASR provider */
export interface ASRWord {
  word: string
  start: number
  end: number
  confidence?: number
}

/** Extended cue with word-level detail and optional speaker */
export interface ASRCue {
  start: number
  end: number
  text: string
  words?: ASRWord[]
  speakerId?: string  // Reserved for future diarization (Phase 2)
}

/** Result of a single ASR transcription call */
export interface ASRTranscriptionResult {
  cues: ASRCue[]
  language?: string
  durationSeconds?: number
  provider: 'groq'
  model: string
}
```

**Rendering contract**: The player and transcript UI consume `subtitle[]`. The conversion from `ASRCue[]` to `subtitle[]` is a simple map (`{ start, end, text }`). The full `ASRCue[]` data is persisted alongside the raw content for future word-level highlighting.

## Persistence Contract (Required)

- `RemoteTranscriptCache` must add `rawAsrData?: string` (JSON.stringify of `ASRCue[]`).
- `SubtitleText` must add `rawAsrData?: string` for local-file ASR results.
- `rawAsrData` is write-on-success only.
- Existing non-ASR subtitle flows continue writing `content` without `rawAsrData`.

## Plan

### 1. Settings & Schema
- Update `SettingsSchema` to include:
  - `asrProvider` ('groq', default 'groq')
  - `asrModel` (string, default 'whisper-large-v3-turbo')
- Update `useSettingsForm` and `useSettingsData` to handle these fields.
- Reject/normalize any non-`groq` persisted provider value to `groq` during hydration.
- Ensure `groqApiKey` is handled via the `CredentialsRepository` (per Instruction 122).

### 2a. ASR Client Layer
- Create `apps/lite/src/lib/asr/index.ts` as the unified interface.
- Create `apps/lite/src/lib/asr/groq.ts`:
  - Implement `transcribeAudio(blob: Blob, apiKey: string, model: string, signal?: AbortSignal): Promise<ASRTranscriptionResult>`.
  - Request `verbose_json` response format from Groq to extract word-level timestamps.
  - Implement `verifyKey(apiKey: string): Promise<boolean>` (call Groq's `/models` endpoint with the key; 200 = valid, 401 = invalid).
- **Network contract**:
  - Use direct HTTPS requests to `api.groq.com` for `verifyKey` + transcription.
  - Do not use RSS/iTunes CORS proxy path for ASR calls.
  - Map CORS/network fetch failures to the existing "Network Error" tier.
- Create `apps/lite/src/lib/asr/types.ts` with the data types defined above.

### 2b. Payload Guardrail (MVP in 123)
- **Fixed rule for this instruction**: No client chunking in 123.
- If audio Blob size > 20MB, fail fast with `asrFileTooLarge`, set status to `failed`, and stop.
- Record a follow-up task for chunking (123b) instead of partial implementation in this instruction.

### 3. Settings UI
- Add an "ASR (Speech-to-Text)" section in Settings.
- Components:
  - Dropdown for `asrProvider` (initially only Groq, but extensible).
  - Input for API Key (Password type, with show/hide toggle).
  - **Verify** button with loading state and success/fail toast.
  - **Cost transparency note**: Display a brief helper text below the toggle, e.g., "每分钟音频约消耗若干 token，详见 Groq 定价" with a link to Groq's pricing page.

### 4. Player & Trigger Integration
- In `apps/lite/src/lib/remoteTranscript.ts`:
  - Modify `autoIngestEpisodeTranscript`: If remote fetch fails OR returns no cues, check provider/model/key availability.
  - If everything is ready, call `startOnlineASR`.
  - **Abort contract**: Before starting ASR, store a new `AbortController` in `playerStore.abortAsrController`. On track switch / component unmount, call `abortAsrController.abort()`.
- In `apps/lite/src/store/playerStore.ts`:
  - Add `transcribing` to `TranscriptIngestionStatus`.
  - Add `abortAsrController: AbortController | null` to state.
  - Keep `asrProgress` nullable. For 123 MVP (no chunking), set `null` for the whole flow.
  - Update `setTranscriptIngestionStatus` to handle `transcribing`.
  - On `loadTrack` / `clearTrack`, auto-abort any in-flight ASR.
- **State transition integrity (Required)**:
  - Start: set `transcribing`, register controller.
  - Success: set `loaded` (or existing success status), clear controller.
  - Abort (track switch / unmount): set `idle`, clear controller, no error toast.
  - Fail (401/429/413/5xx/network): set `failed`, clear controller.
- For local files:
  - In the Player fullscreen view, when `subtitlesLoaded` is false and provider/model/key are configured, show a **"生成字幕 (ASR)"** button in the `noTranscript` empty state area.
  - Clicking this button triggers the same ASR pipeline, targeting the current `fileTrackId`.
- **Concurrency Lock (Required)**:
  - Enforce "One active ASR task per track" rule.
  - If triggered again while `transcribing`, ignore the request (debounce/lock).
  - If triggered for a *new* track, the previous track's task must be `aborted` first.
  - Prevent double-billing/double-request caused by UI race conditions (e.g., rapid clicks).

### 5. Persistence
- On successful transcription:
  - For Podcasts: Save to `remote_transcripts` table using normalized audio URL as key. Store `rawAsrData` (ASRCue JSON) alongside display content.
  - For Local Files: Create a `FileSubtitle` entry and save content to `subtitles` table, linking it to `localTrackId`. Store `rawAsrData` in the same subtitle row. Subtitle name format: `"ASR – <model> – <timestamp>"`.
- **Deduplication**: Before starting ASR, check if a cached transcript already exists for the audio URL / track. If found, use the cache.
- **Dedup keys (Required)**:
  - Podcast path: normalized `audioUrl`.
    - **Normalization Rule**: Protocol (https), lowercase host, remove trailing slash, remove tracking params (`utm_*`, `fbclid`, etc.).
  - Local file path: `localTrackId` (never object URL).

### 6. Error UX Tiers

| HTTP Status | User Experience | Behavior |
|:---|:---|:---|
| **401** (Unauthorized) | Toast: "API Key 无效，请检查设置" + auto-navigate to Settings ASR section | Do not retry |
| **429** (Rate Limited) | Toast: "请求过于频繁，稍后重试" | Exponential backoff, max 2 retries |
| **413** (Payload Too Large) | Toast: "音频文件超过 API 上限" | Suggest chunking (future) or shorter audio |
| **Network Error** | Silent degradation (offline badge already visible) | No toast; set status to `failed` |
| **5xx** (Server Error) | Toast: "转录服务暂时不可用" | Single retry after 3s |
| **Abort** (User Action) | None (Silent) | Status resets to `idle`; no toast |
| **Offline/Network** | Offline Badge + "连接失败" | Status `failed`; no retry storm |
| **4xx** (Other Client Err) | Toast: "请求参数错误 (4xx)" | Fail fast; do not retry |

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run` (Add new tests for `lib/asr`)

## Impact Checklist
- **Affected modules**:
  - ASR client (`lib/asr/*`), transcript trigger (`lib/remoteTranscript.ts`)
  - Settings + credentials read path (`useSettingsForm`, `useSettingsData`, settings schema)
  - DB contract (`dexieDb.ts`, `lib/db/types.ts`) for `rawAsrData`
  - Player state transitions (`store/playerStore.ts`)
  - i18n keys and handoff docs (`audio-engine.mdx` + `.zh.mdx`)
- **Regression risks**:
  - ASR starts before credentials/settings hydration completes.
  - track-switch abort leaves stale `transcribing` status.
  - raw ASR payload not persisted due to missing DB/type update.
  - local-file dedup keyed by unstable object URL.
  - non-groq provider value leaking from stale settings.
- **Required verification**:
  - 401/429/413/5xx/network tiers map to expected toasts + status.
  - track switch during ASR aborts request and clears controller/status.
  - podcast and local-file paths persist `rawAsrData` on success.
  - >20MB input fails fast with `asrFileTooLarge` (no chunking path in 123).
  - settings hydration normalizes provider to `groq`.
  - **Concurrency tests**:
    - Triggering ASR twice on the same track results in only ONE network request.
    - Switching tracks aborts the first request instantly.
  - **Key Precedence tests**:
    - If DB has key A and env has key B, client uses key A.
  - **Cache Key tests**:
    - `example.com/audio.mp3` and `example.com/audio.mp3?utm_source=rss` resolve to the SAME cache entry.

## i18n Keys (New)
- `settingsAsrTitle`: "语音转录 (ASR)" / "Speech-to-Text (ASR)"
- `settingsAsrDesc`: "为没有字幕的内容自动生成转录" / "Auto-generate transcripts for content without subtitles"
- `settingsAsrEnable`: "启用在线转录" / "Enable online transcription"
- `settingsAsrProvider`: "转录服务" / "Transcription provider"
- `settingsAsrApiKey`: "API Key"
- `settingsAsrVerify`: "验证" / "Verify"
- `settingsAsrVerifying`: "验证中…" / "Verifying…"
- `settingsAsrVerifyOk`: "Key 有效" / "Key is valid"
- `settingsAsrVerifyFail`: "Key 无效" / "Key is invalid"
- `settingsAsrCostNote`: "每分钟音频约消耗若干 token，详见 {{link}}" / "Each minute of audio costs approximately X tokens, see {{link}}"
- `asrTranscribing`: "正在转录…" / "Transcribing…"
- `asrTranscribingProgress`: "正在转录 ({{current}}/{{total}})…" / "Transcribing ({{current}}/{{total}})…"
- `asrGenerateSubtitles`: "生成字幕 (ASR)" / "Generate Subtitles (ASR)"
- `asrSuccess`: "转录完成" / "Transcription complete"
- `asrFileTooLarge`: "音频文件超过大小上限 (20MB)" / "Audio file exceeds size limit (20MB)"
- `asrKeyInvalid`: "API Key 无效，请前往设置检查" / "API Key is invalid, please check Settings"
- `asrRateLimited`: "请求过于频繁，稍后自动重试" / "Too many requests, will retry shortly"
- `asrServiceUnavailable`: "转录服务暂时不可用" / "Transcription service temporarily unavailable"

## Decision Log
- **Groq as First Provider**: Chosen for LPU-speed and 2026 technical roadmap alignment.
- **Word-level timestamps**: Mandatory for the "Readio" experience (highlighting). The `ASRCue` type preserves word-level data even though initial rendering uses segment-level `subtitle[]`.
- **Manual vs Auto**: Auto-ASR for podcasts (if enabled), manual button for local files (to prevent accidental large file uploads and unexpected API cost).
- **AbortController for cancellation**: In-flight ASR requests are cancelled on track switch to preserve user's API quota.
- **Speaker diarization**: Reserved in data types (`speakerId`) but not implemented in this instruction. Planned for a future Server Tier integration.
- **Post-review: i18n 25→20MB**: User-facing `asrFileTooLarge` message aligned with actual `ASR_MAX_BLOB_BYTES` (20MB), not Groq's server limit (25MB).
- **Post-review: verifyKey signal**: `verifyKey`/`verifyAsrKey` accept optional `AbortSignal` for cancellation on unmount.
- **Post-review: words validation**: `parseRawAsrCues` validates `words` array items instead of blind cast — rawAsrData is self-generated but DB contents could be corrupted or from an older schema.
- **Infrastructure Refinement: Router Integration**: Refactored `navigateToSettingsAsrSection` to use an event-based navigation request, allowing the UI layer (RootLayout) to handle routing via TanStack Router. This resolves brittleness and avoids circular dependencies in utility modules.
- **Infrastructure Refinement: Fail-Closed Security**: Removed `migrateCredentialsFromLocalStorage` legacy path. Unified ASR startup exceptions in `remoteTranscript.ts` into a `try/catch/finally` block for guaranteed state cleanup.
- **Infrastructure Refinement: Epoch-Guarded Writes**: Implemented `settingsWriteEpoch` in `schemas/settings.ts` and `credentialWriteEpoch` in `credentialsRepository.ts` to prevent stale asynchronous writes from overwriting settings after a `wipeAll` operation.
- **Infrastructure Refinement: SRT Rollover Fix**: Corrected `formatSrtTimestamp` to handle millisecond rollovers (e.g., 1000ms) correctly, ensuring valid `HH:MM:SS,mmm` output.

## Bilingual Sync
- Update `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx` and its `.zh.mdx` counterpart to document the ASR flow, including trigger logic, error tiers, and data persistence.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-18
- Post-review refinements: 2026-02-19
- **Error UI & Logic Refinements**: 2026-02-23.
  - Added explicit icon-based status for ASR verification in Settings (Verify/Check/X) with auto-reset and direct visual feedback.
  - Refactored `ReadingContent` error state: standardized on `secondary` buttons, removed technical error strings from the UI (limiting them to logs), and ensured a user-friendly "Transcription Failed" title is always present.
  - Implemented mandatory auto-save of audio Blobs to `podcast_downloads` upon successful ASR to ensure offline availability.
  - Fixed a regression where ASR would show a "Failed" status even if disabled; it now correctly enters `idle` for a seamless listening experience.
