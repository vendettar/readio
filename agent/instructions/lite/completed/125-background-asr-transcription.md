# Instruction 125: Background ASR Transcription on Downloaded Local Audio [COMPLETED]

## Hard Dependencies
- Instruction 124 must be fully implemented and merged.
- Credentials/settings split from Instruction 122 must be available.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `agent/instructions/lite/124-fundamental-downloads.md`

## Goal
After an episode is downloaded (local blob persisted by 124), run ASR in background from that local binary and persist a synchronized subtitle result.

Key boundary:
- ASR input must be local blob from IndexedDB.
- No fallback to remote audio fetch for ASR.

## Product Decisions (Locked)
1. Reuse shared ASR utilities where valid, but implement a dedicated local-audio ASR pipeline entry for downloaded tracks.
2. ASR chunking is sequential only (no parallel chunk requests).
3. One-time retry per chunk for retryable errors.
4. Transcription is background work and does not block playback.
5. If ASR fails, playback remains available and unaffected.
6. Queue policy is fixed:
   - Global ASR job concurrency = 1.
   - Jobs are processed FIFO.
   - Per-track dedupe remains enabled (`localTrackId` lock).
   - Manual trigger for currently playing track has priority boost: insert at queue head (but still respects single active job).
7. Chunk validity policy is fixed:
   - Raw `Blob.slice(byte-range)` chunks are forbidden as upload payload when they are not independently decodable.
   - Upload chunks must be independently decodable media segments.
8. Deduplication policy across instructions is fixed:
   - Online ASR (123) and background ASR (125) share one global registry, but dedupe key must include source provenance.
   - Required dedupe identity: `normalizedAudioUrl + sourceKind + sourceFingerprint + provider + model`.
   - `sourceKind=local_persisted` jobs in 125 are never blocked by `sourceKind=remote_online` completed entries from 123.

## Scope
- `apps/lite/src/lib/remoteTranscript.ts`
- `apps/lite/src/lib/asr/*`
- `apps/lite/src/lib/db/types.ts`
- `apps/lite/src/lib/dexieDb.ts`
- `apps/lite/src/lib/repositories/FilesRepository.ts`
- `apps/lite/src/store/playerStore.ts`
- `apps/lite/src/lib/runtimeConfig.defaults.ts`
- `apps/lite/src/lib/runtimeConfig.schema.ts`
- `apps/lite/src/lib/runtimeConfig.ts`
- `apps/lite/src/lib/__tests__/*`
- `apps/lite/src/hooks/__tests__/*`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Scope Scan (8 Scopes)
- Config:
  - Add `ASR_CHUNK_MAX_BYTES` config and validation.
- Persistence:
  - Persist ASR output into `subtitles` + `local_subtitles` linked to downloaded local track.
  - Persist raw cue payload (`rawAsrData`) for deterministic rehydrate.
- Routing:
  - No route contract changes.
- Logging:
  - Log chunk progress/failures without API key leakage.
- Network:
  - ASR provider calls only; no remote audio re-fetch.
- Storage:
  - Input audio always read from `audioBlobs` via `local_tracks.audioId`.
- UI state:
  - Expose background ASR status independent from playback-ready status.
- Tests:
  - Add chunking, retry, merge, persistence, and state transition tests.

## Hidden Risk Sweep
- Async control flow:
  - Prevent duplicate ASR jobs per `localTrackId`.
  - Keep stale completion guards to avoid writing subtitles to wrong active track state.
  - Global queue starvation must be prevented (job terminal cleanup always releases queue slot).
- Hot path performance:
  - Large blob slicing and merge loops must run async; no long synchronous blocking.
- State transition integrity:
  - Background ASR states cannot block playback controls.
- Data integrity:
  - Failed job must not leave partial subtitle rows linked as active subtitle.

## Required Patterns
- Repository boundary:
  - Use DB/repository APIs; no ad-hoc table writes from UI components.
- Deterministic source contract:
  - ASR entry receives `localTrackId` and resolves blob from DB only.
- Single merge implementation:
  - One canonical chunk merge function for timeline offset and dedupe.
- Queue authority:
  - One queue manager is the sole authority for job scheduling, dedupe, and lifecycle transitions.
- Global ASR registry:
  - One shared registry is the sole authority for cross-path dedupe between 123 and 125.
  - Registry must preserve source provenance so local-binary revalidate is not skipped.

## Forbidden Dependencies
- No FFmpeg/wasm.
- No new backend service.
- No parallel ASR fan-out worker pool.

## Runtime Config
Add:
- App key: `ASR_CHUNK_MAX_BYTES`
- Env key: `READIO_ASR_CHUNK_MAX_BYTES`
- Default: `20971520` (20MB)

Validation:
- Positive integer.
- Recommended lower bound: >= `5242880` (5MB) to avoid excessive chunk count.
- Must remain below provider hard payload limit.

## Data Contract
- Input contract:
  - `localTrackId` required.
  - Resolve `local_tracks` then `audioBlobs`.
  - Missing track/blob is terminal `failed`.
- Output contract:
  - Persist merged subtitle content to `subtitles`.
  - Persist `rawAsrData` as serialized merged ASR cues.
  - Persist/replace `local_subtitles` mapping for this track with deterministic naming.
  - Update `activeSubtitleId` only after full successful merge and persist.
- No remote audio fallback contract:
  - If local blob read fails, do not fetch remote URL audio as substitute.

Chunking input contract:
- Chunk generation must output independently decodable audio segments.
- If decodable segment generation fails for a format, mark job `failed` with deterministic chunking error and do not emit partial subtitle mapping.
- Decodable chunking technical path (required):
  - For `audio/mpeg`, use frame-boundary parsing to build chunk segments (lightweight MP3 frame parser; no full decode).
  - For unsupported formats where frame-safe segmentation is unavailable, fail deterministically with `chunking_unsupported_format`.
  - Do not load full audio into `AudioContext` for whole-file decode in 125.

Format support matrix contract:
- Supported in 125:
  - `audio/mpeg` (frame-boundary segmenting path).
- Not supported in 125:
  - `audio/mp4`, `audio/aac`, `audio/x-m4a`, and other formats without safe segmentation path.
- UX contract for unsupported format:
  - Show deterministic toast key `asrChunkingUnsupportedFormat`.
  - Keep playback unaffected and keep job terminal state `failed`.

## Execution Path

### Phase 1: Queue and Guard
1. Trigger local ASR job when downloaded track is ready or user invokes manual retry.
   - Gate conditions: provider/model configured, API key available, app online.
   - If gate fails, do not enqueue and set deterministic non-running status.
2. Acquire in-flight lock by `localTrackId`.
3. If same track job already running, ignore duplicate trigger.
4. Resolve `normalizedAudioUrl` for this track and check global ASR registry:
   - Skip enqueue only when dedupe identity matches (`normalizedAudioUrl + sourceKind + sourceFingerprint + provider + model`).
   - Do not skip local-persisted job due to remote-online completed result.
5. Enqueue job into global FIFO queue and process only one job at a time.

### Phase 2: Chunking and Provider Calls
1. Read full local blob from DB.
2. Build independently decodable chunk blobs (max bytes per chunk from `ASR_CHUNK_MAX_BYTES`).
3. Submit chunks strictly sequentially.
4. Retry each chunk once on retryable errors (`network_error`, `rate_limited`).
5. Permanent errors (`unauthorized`, `service_unavailable`, decode failures, chunking failures) end full job as `failed`.

### Phase 3: Timeline Reconstruction and Dedup
1. Maintain `accumulatedChunkStartSeconds` from generated chunk metadata as ground truth.
2. Shift incoming cues by `accumulatedChunkStartSeconds`.
3. Provider response duration is validation-only and fallback-only when chunk metadata is missing.
4. Boundary dedupe rule:
   - drop incoming cue when normalized text equals previous merged cue text and start delta <= 300ms.

### Phase 4: Persist and Publish
1. Persist merged cues/content to subtitle rows.
2. Link subtitle to local track and set active subtitle.
3. Publish ready state to player/reading UI.
4. Clear in-flight lock and progress state.

## State Transition Contract
- Required statuses (background ASR per track):
  - `idle` -> `queued` -> `transcribing` -> `ready` or `failed`
- Status storage contract:
  - Maintain `backgroundAsrStatusByTrackId` keyed by `localTrackId`.
  - Do not overload single-track playback status fields for background jobs.
- Track switch behavior:
  - ASR job is keyed to `localTrackId` and continues in background; switching currently playing episode does not cancel the job.
- Manual cancel is out of scope for 125.

## Acceptance Criteria
1. For supported decodable formats, ASR on downloaded episodes processes files above 50MB by sequential chunking (no 413 from oversized single payload).
2. ASR never fetches remote audio URL as input when local blob is missing.
3. Merged timeline is monotonic and does not reset to 0 between chunks.
4. Chunk boundary duplicate cues are removed by deterministic dedupe rule.
5. Playback remains available while transcription is running.
6. Failed ASR does not corrupt active subtitle mapping.
7. Removing a downloaded episode cascade-removes linked generated subtitles.
8. Global queue guarantees at most one active ASR provider request chain at any time.
9. Cross-path dedupe prevents duplicate ASR calls only when full dedupe identity matches (`normalizedAudioUrl + sourceKind + sourceFingerprint + provider + model`).
10. Manual trigger for active playback track is prioritized ahead of background FIFO jobs.
11. Unsupported audio formats fail deterministically with `asrChunkingUnsupportedFormat` and no partial subtitle activation.

## Tests (Required)
- Chunking/transcription:
  - sequential submission order.
  - retry-once behavior for retryable chunk errors.
  - permanent failure stops whole job.
  - chunk payloads are independently decodable (no raw non-decodable byte-slice uploads).
  - `audio/mpeg` uses frame-boundary segmentation path; unsupported formats fail with deterministic error.
- Merge:
  - shifted offsets are monotonic.
  - boundary dedupe removes duplicate split artifacts.
  - offset baseline uses chunk start time ground truth, not provider duration as primary source.
- Persistence:
  - success persists subtitle + rawAsrData and sets active mapping.
  - failure leaves no partial active mapping.
- Source contract:
  - ASR input resolves from local blob only.
  - missing blob path fails without remote-audio fetch fallback.
- State:
  - duplicate trigger dedup by `localTrackId`.
  - track switch does not terminate unrelated running local-track ASR job.
  - global queue runs one active job only and preserves enqueue order except explicit manual-priority insertion rule.
  - manual trigger is inserted ahead of queued background jobs and executes next.
  - global ASR registry dedupes with source-provenance key; 123 remote-online completion does not suppress required 125 local-persisted run.
  - unsupported format path emits `asrChunkingUnsupportedFormat` and leaves no partial subtitle mapping.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite build`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscript*.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/asr/*.test.ts`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - local ASR orchestration
  - ASR chunk/merge utilities
  - subtitle persistence linkage
  - runtime config and validation
- Regression risks:
  - wrong offset merge causing transcript drift
  - duplicate jobs causing redundant provider cost
  - partial persistence causing subtitle corruption
- Required verification:
  - all commands above pass
  - ASR input path is local-only and covered by tests

## Decision Log
- Required: Yes.

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
