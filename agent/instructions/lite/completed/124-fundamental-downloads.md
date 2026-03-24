# Instruction 124: Fundamental Offline Downloads MVP (Data + UI) [COMPLETED]

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`

## Goal
Deliver the offline-download foundation for Readio Lite: users can download remote podcast episodes into IndexedDB, play downloaded episodes offline, and manage downloaded items from a dedicated Downloads entry.

CRITICAL boundary:
- Instruction 124 includes audio download, persistence, playback source resolution, and download management UX only.
- No ASR API call, no chunk transcription, no subtitle generation in this instruction.

## Product Decisions (Locked)
1. Capacity policy uses the existing global config only:
   - `MAX_AUDIO_CACHE_GB` (`READIO_MAX_AUDIO_CACHE_GB`)
   - No separate podcast sub-cap in 124.
2. Capacity enforcement uses tolerant overflow once:
   - Known size (`Content-Length` available): enforce pre-flight hard check.
   - Unknown size (`Content-Length` unavailable): allow this download attempt.
   - If this attempt pushes usage over cap, persist is still allowed.
   - After usage is over cap, all subsequent download starts are blocked until manual cleanup brings usage back under cap.
3. No auto-eviction in 124.
4. Offline filtering scope:
   - Downloads page is hard-filtered to downloaded content by definition.
   - Other pages (Library, Subscriptions, Search) keep normal result sets; remote-only items must be visible but disabled for playback while offline.
5. Playback source preference:
   - When a normalized URL has a downloaded mapping, play local blob.
   - Otherwise play remote URL.
6. Re-download idempotency:
   - If a `podcast_download` mapping already exists for the same normalized URL, download action is a no-op and must not create duplicate blob rows.
7. Download cancellation and progress contract:
   - Download service must accept `AbortSignal`.
   - User cancel/delete on a pending download must abort fetch immediately.
   - Navigation away from Downloads page does not auto-abort download jobs.
   - Download service must expose `onProgress({ loadedBytes, totalBytes, percent })` for deterministic UI progress rendering.
   - If `totalBytes` is unknown, `percent` must be `null` (not estimated).

## Scope
- `apps/lite/src/lib/db/types.ts`
- `apps/lite/src/lib/dexieDb.ts`
- `apps/lite/src/lib/repositories/FilesRepository.ts`
- `apps/lite/src/lib/player/remotePlayback.ts`
- `apps/lite/src/hooks/useEpisodePlayback.ts`
- `apps/lite/src/store/playerStore.ts`
- `apps/lite/src/lib/runtimeConfig.defaults.ts`
- `apps/lite/src/lib/runtimeConfig.schema.ts`
- `apps/lite/src/lib/runtimeConfig.ts`
- `apps/lite/src/routes/*` (Downloads route + navigation integration)
- `apps/lite/src/lib/__tests__/*`
- `apps/lite/src/hooks/__tests__/*`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Scope Scan (8 Scopes)
- Config:
  - Reuse `MAX_AUDIO_CACHE_GB` as the only cap config in 124.
- Persistence:
  - Persist downloaded remote audio into `audioBlobs` + `local_tracks`.
  - Mark downloaded tracks as `sourceType = 'podcast_download'`.
- Routing:
  - Add Downloads entry and route.
- Logging:
  - Log download start/success/fail without sensitive payload.
- Network:
  - Download a single remote binary per requested episode.
- Storage:
  - No auto-eviction; manual cleanup only.
- UI state:
  - Add deterministic download statuses on episode cards and Downloads page.
- Tests:
  - Add DB/index, capacity, playback source, offline state, and cleanup tests.

## Hidden Risk Sweep
- Async control flow:
  - Deduplicate in-flight download jobs by normalized source URL.
  - Keep request guards so stale completion cannot overwrite current player state.
- Hot-path performance:
  - URL-to-local lookup must use indexed query (`[sourceType+sourceUrlNormalized]`).
  - No render-path table scans.
- State transition integrity:
  - Offline mode must not create action dead-ends; disabled items must expose clear reason.
- Data lifecycle:
  - Startup orphan sweep removes only truly unreferenced `audioBlobs` (not referenced by `local_tracks.audioId`, `local_tracks.artworkId`, or `playback_sessions.audioId`).
- Memory safety:
  - `URL.createObjectURL` must always pair with `URL.revokeObjectURL` on source swap/unmount.
  - Download pipeline must avoid full-response buffering; use stream/chunk processing to avoid OOM on mobile browsers.

## Required Patterns
- Repository boundary:
  - UI/hooks do not directly call raw Dexie tables.
- URL normalization:
  - Single helper must be reused for download keying and playback lookup.
  - Must reuse the same canonical normalization contract used by Instruction 123 (shared helper, no duplicate implementation).
- Deterministic cap contract:
  - Over-cap behavior must exactly match locked policy above.

## Forbidden Dependencies
- No FFmpeg/wasm in 124.
- No new backend service.
- No new media worker framework.

## Data Model Changes

### FileTrack extension
Update `FileTrack` in `apps/lite/src/lib/db/types.ts`:
- `sourceType?: 'user_upload' | 'podcast_download'`
- `sourceUrlNormalized?: string`
- `lastAccessedAt?: number`
- `sourcePodcastTitle?: string`
- `sourceEpisodeTitle?: string`
- `sourceArtworkUrl?: string`
- `downloadedAt?: number`

### IndexedDB index update
Update `local_tracks` indexes in `apps/lite/src/lib/dexieDb.ts`:
- `[sourceType+sourceUrlNormalized]`
- `[sourceType+lastAccessedAt]`

## Capacity Enforcement Contract
1. Resolve effective cap bytes from `MAX_AUDIO_CACHE_GB`.
2. Usage accounting scope is fixed:
   - Capacity checks must count total bytes across all `audioBlobs` rows (global audio cache), not only podcast-download rows.
3. On download start (pre-flight):
   - If `navigator.storage.estimate()` is available, check `estimate.quota - estimate.usage`.
   - If remaining physical quota is clearly below the incoming payload estimate, fail early with storage-limit toast (same key as cap failure).
   - If current usage already exceeds cap, block immediately.
   - If `Content-Length` exists and `usage + contentLength > cap`, block immediately.
   - If `Content-Length` is absent, allow this attempt.
4. On persist (`QuotaExceededError`):
   - Fail fast, show storage-limit toast, keep playback on remote URL.
5. Over-cap state after tolerant overflow:
   - If post-persist usage exceeds cap, future download starts must be blocked until manual cleanup lowers usage below cap.
6. No automatic deletion in any path.

Required toast key semantics:
- Single user-facing storage error key for all blocked/fail cases.
- Message meaning: manual cleanup required before new downloads.

## Download Service Contract
- Input:
  - `sourceUrlNormalized`
  - `AbortSignal`
  - `onProgress({ loadedBytes, totalBytes, percent })` where `percent` is nullable
- Behavior:
  - Abort must terminate network request and prevent any blob persistence.
  - Progress updates must be monotonic (`percent` non-decreasing).
  - Response handling must be stream-based (no `arrayBuffer()` for full file) to prevent large-memory spikes.
  - Completion writes exactly one `audioBlobs` row and one `local_tracks` row.

## Playback Source Resolution
1. Normalize remote episode `audioUrl`.
2. Query `local_tracks` with `[sourceType+sourceUrlNormalized]` for `podcast_download`.
3. If hit:
   - Play local blob via `URL.createObjectURL`.
   - Update `lastAccessedAt` with throttle (max once per track per 60s).
4. If miss:
   - Play remote URL.
5. On source swap/unmount:
   - Always `URL.revokeObjectURL` old object URL.

## Offline UX Contract
- Add top banner when offline: `offlineDownloadsOnly` style message.
- Downloads page:
  - dedicated route and nav entry.
  - grouped by podcast title from `sourcePodcastTitle` (fallback label: `Unknown Podcast`).
  - summary: episode count + storage used + local-only note.
  - actions: `Manage storage`, `Clear all downloads` with confirm (downloads cache only; not global app wipe).
- Non-Downloads pages while offline:
  - keep items visible.
  - disable playback actions for remote-only items.
  - show deterministic disabled reason.

## Episode Card / Player Indicators
Episode card status slot (fixed position):
1. not downloaded
2. downloading
3. downloaded
4. download failed

Player surface:
- show downloaded badge when source is local cached blob.
- context action: download/remove download based on current source mapping.
- repeated download click on already-downloaded episode shows deterministic "already downloaded" feedback and does not write new rows.

## Acceptance Criteria
1. Remote episode can be downloaded and persisted as `podcast_download` local track.
2. Downloaded episode plays offline via local blob path.
3. Startup orphan sweep removes dangling blob rows.
4. Capacity guard enforces pre-flight for known size and tolerant overflow for unknown size.
5. Once usage is over cap, further download starts are blocked until manual cleanup.
6. No auto-eviction occurs.
7. Offline banner and disabled remote-only behavior are correct.
8. No ASR transcription logic runs in this instruction.

## Tests (Required)
- Download pipeline:
  - dedupe by normalized URL lock.
  - success writes `audioBlobs` + `local_tracks` metadata fields.
  - repeated download on existing mapping is no-op (no new blob/track row).
  - pending download cancel/delete triggers fetch abort and no persistence.
  - progress callback emits monotonic percentage updates when total size is known.
- Capacity:
  - known-size pre-flight block.
  - physical quota pre-flight block when `navigator.storage.estimate()` indicates insufficient remaining space.
  - unknown-size tolerant overflow allowed once.
  - over-cap post-state blocks subsequent download starts.
  - `QuotaExceededError` maps to storage-limit toast and no local mapping write.
- Playback resolution:
  - local mapping plays blob URL.
  - missing mapping plays remote URL.
  - object URL is revoked on source swap/unmount.
  - `lastAccessedAt` throttle behavior.
- Offline UI:
  - banner visible while offline.
  - non-downloaded items disabled (not hidden) on non-Downloads pages.
  - Downloads page grouping uses `sourcePodcastTitle` and correct summary.
- Integrity:
  - orphaned data sweep removes only truly unreferenced blobs.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite build`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/dbOperations.test.ts`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - DB schema/types
  - download and playback resolution path
  - offline UI state and routing
  - runtime config usage
- Regression risks:
  - incorrect normalized-key mapping causing duplicate downloads
  - stale object URL memory leak
  - over-cap state not enforced after tolerant overflow
  - offline state hiding content unexpectedly
- Required verification:
  - all commands above pass
  - no UI-layer direct Dexie bypass

## Decision Log
- Required: Yes.

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
