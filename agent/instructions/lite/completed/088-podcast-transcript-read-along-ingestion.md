# Task: 088 - Podcast Transcript Ingestion for Read-Along Playback [COMPLETED]

## Objective
Enable Readio to automatically ingest Podcasting 2.0 transcript resources for podcast episodes during playback, so users can use the core "listen while reading" experience without manual subtitle upload.

Target behavior:
- If an episode exposes `podcast:transcript` (`episode.transcriptUrl`), playback should try to load transcript cues automatically.
- If transcript fetch/parse fails, playback remains functional and existing fallback UI remains available.
- Keep current external transcript button behavior (open source URL) as a non-blocking fallback path.

## Product Decision (Fixed)
1. Transcript source is `episode.transcriptUrl` from RSS parse (`podcast:transcript` URL attribute).
2. Automatic ingestion is triggered when a podcast episode starts playback (not merely when detail page renders).
3. Read order for transcript data is:
   - in-memory cache (session/runtime)
   - IndexedDB transcript cache
   - network fetch
4. Write policy is success-only:
   - successful fetch + successful parse -> persist/update cache
   - fetch/parse failure -> keep existing cached transcript (if any), do not delete on failure
5. Existing manually loaded local subtitles always have higher priority than auto-downloaded podcast transcript for the same active playback context.
6. Supported transcript formats in this instruction:
   - plain SRT / VTT text
   - Podcast transcript JSON variants (when deterministic start/end text cues can be derived)
7. Unsupported transcript formats must fail gracefully (no playback block, no crash), with debug logging only.
8. Keep current `View Transcript` button (external open) for source inspection and fallback.

## Scope Scan (Required)
- Config:
  - No new runtime env key required in this instruction.
- Persistence:
  - Add transcript cache persistence for remote podcast transcripts in IndexedDB.
  - No migration/backfill for legacy content required.
- Routing:
  - No route changes.
- Logging:
  - Add debug-level logs for transcript cache hit/miss/fetch/parse outcomes; no user-facing error toast spam.
- Network:
  - Transcript fetch must use existing resilient fetch pipeline (`fetchWithFallback`/proxy-capable path), not raw fetch-only calls.
- Storage:
  - Transcript cache uses bounded IndexedDB policy; no localStorage transcript payload storage.
  - No read-time deletion; cleanup on explicit maintenance / bounded writes only.
- UI state:
  - Playback must remain actionable even if transcript load fails.
  - Transcript view should update when transcript cues become available.
- Tests:
  - Add parser, cache, and playback integration tests covering success/failure/race paths.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Prevent stale transcript responses from overriding newer playback context after track switch.
  - Ensure request cancellation / sequence guards are honored on rapid episode switching.
- Hot-path performance:
  - Avoid parsing large transcript payloads repeatedly per render.
  - Avoid blocking initial audio playback on transcript download.
- State transition integrity:
  - Transcript load failures must not force player into `error` or block `play/pause/seek`.
  - Auto transcript injection must not clear/override manually loaded local subtitle state.
- Dynamic context consistency:
  - Transcript cache key must include canonical URL identity (normalized URL) to avoid cross-episode bleed.
  - If transcript URL changes upstream, new URL must be treated as a distinct cache entity.

## Implementation Steps (Execute in Order)
1. **Define transcript cache domain model**
   - Add explicit type(s) for remote transcript cache records in:
     - `apps/lite/src/lib/db/types.ts`
   - Include at minimum:
     - `id` (stable key, e.g., hash/normalized transcript URL)
     - `url`
     - `format`
     - `rawContent` (or canonical serialized form)
     - `fetchedAt`
     - optional metadata (`contentType`, cue count, source provider marker)

2. **Add IndexedDB table for remote transcripts**
   - Update Dexie schema in:
     - `apps/lite/src/lib/dexieDb.ts`
   - Add CRUD helpers for remote transcript cache read/write/remove.
   - Ensure `wipeAll` cleanup includes this table.
   - Do not couple this table with local file subtitle tables (`local_subtitles`).

3. **Implement transcript fetch + normalize + parse module**
   - Create a dedicated module (e.g., `apps/lite/src/lib/remoteTranscript.ts`) to:
     - fetch transcript payload via resilient network path
     - detect/normalize format
     - parse to Readio subtitle cue structure (`subtitle[]`)
   - Reuse existing subtitle parser utilities where applicable (`subtitles.ts`) for SRT/VTT.
   - Add deterministic JSON mapping strategy for Podcast transcript JSON variants (document exact supported fields).
   - Return structured parse result with explicit status/reason for unsupported formats.

4. **Implement transcript cache service with stale-safe behavior**
   - Add cache helper(s) with read contract:
     - `fresh` | `stale` | `miss`
   - On stale hit:
     - return cached cues immediately
     - trigger background revalidation
   - On revalidation failure:
     - preserve stale cache
   - Apply bounded retention policy (time + count based) on successful writes only.

5. **Integrate auto-ingestion into podcast playback flow**
   - Wire transcript auto-load into podcast playback path after `setAudioUrl(...metadata)`:
     - `apps/lite/src/hooks/useEpisodePlayback.ts`
     - any equivalent local-search podcast playback entrypoints (`apps/lite/src/lib/localSearchActions.ts`)
   - Pass transcript source metadata through player metadata when available.
   - Ensure transcript load is non-blocking to audio start.

6. **Guard player state and precedence**
   - Enforce priority:
     - manual local subtitle (if present/loaded) > auto remote transcript
   - Enforce race safety:
     - only apply transcript cues if current playback request/session still matches initiating context.
   - Keep current behavior of clearing subtitles on track change unless a valid transcript for the new track is applied.

7. **Keep detail-page fallback action**
   - Keep current `View Transcript` external-open action in episode detail page.
   - Do not remove transcript/chapter external actions in this instruction.

8. **Add explicit maintenance integration**
   - Add remote transcript cache cleanup into existing maintenance paths without creating duplicate entrypoints.
   - Keep cleanup deterministic and testable.

9. **Documentation sync (atomic with architecture change)**
   - Update docs to reflect:
     - transcript source and supported formats
     - cache storage layer (IndexedDB) and read/write semantics
     - playback integration and precedence rules

## Acceptance Criteria
- Podcast episode with valid `transcriptUrl` auto-loads transcript cues during playback.
- Transcript load does not block or delay core audio play controls.
- On transcript fetch/parse failure, playback remains fully functional and no crash occurs.
- Cached transcript cues are reused on subsequent playback (before network when available).
- Stale cached transcript remains usable when revalidation fails.
- Manual local subtitle remains authoritative over auto remote transcript.
- Existing external transcript button still works.

## Required Tests
### Test File Plan (Exact Paths)
1. **Create** `apps/lite/src/lib/__tests__/remoteTranscript.test.ts`
   - format detection: SRT / VTT / supported JSON variants
   - parser mapping: raw payload -> `subtitle[]` cues
   - malformed/unsupported payload -> deterministic failure result (no throw-to-crash)
   - URL normalization and identity-key derivation behavior

2. **Create** `apps/lite/src/lib/__tests__/remoteTranscriptCache.test.ts`
   - cache read contract: `fresh | stale | miss`
   - stale hit returns cached cues and schedules revalidation
   - revalidation success overwrites cache
   - revalidation failure preserves stale cache
   - bounded retention/eviction on write-only (not read path)

3. **Modify** `apps/lite/src/lib/__tests__/dbOperations.test.ts`
   - remote transcript cache CRUD (create/read/update/delete)
   - `wipeAll` includes remote transcript table cleanup

4. **Modify** `apps/lite/src/lib/discovery/__tests__/appleCacheBehavior.test.ts`
   - RSS parser coverage for `podcast:transcript` URL extraction into episode model
   - ensure transcript/chapter fields survive cache write/read roundtrip for feed path

5. **Create** `apps/lite/src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
   - playback with `transcriptUrl` triggers async transcript ingestion
   - ingestion is non-blocking to `setAudioUrl + play`
   - rapid track switch: old transcript response cannot override current track
   - transcript failure does not break playback action flow

6. **Modify** `apps/lite/src/store/__tests__/playerStore.test.ts`
   - precedence guard: manual local subtitle remains authoritative over auto-remote transcript
   - subtitle state is not incorrectly cleared by late async remote transcript completion

### Minimum Assertion Matrix
- Parser: SRT/VTT/JSON success + malformed fail
- Cache: fresh/stale/miss + stale-if-error
- Playback: auto-load trigger + non-blocking + race safety
- Persistence: IndexedDB transcript table CRUD + wipe behavior
- Precedence: manual subtitle > auto remote transcript

## Verification Commands
- Targeted test execution during implementation:
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscript.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscriptCache.test.ts`
  - `pnpm -C apps/lite test:run -- src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `pnpm -C apps/lite test:run -- src/store/__tests__/playerStore.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/discovery/__tests__/appleCacheBehavior.test.ts`
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules (expected):
  - `apps/lite/src/lib/db/types.ts`
  - `apps/lite/src/lib/dexieDb.ts`
  - `apps/lite/src/lib/subtitles.ts` (reuse/extension only if needed)
  - new transcript ingest/cache module under `apps/lite/src/lib/`
  - `apps/lite/src/store/playerStore.ts` (metadata or transcript apply path, if required)
  - `apps/lite/src/hooks/useEpisodePlayback.ts`
  - `apps/lite/src/lib/localSearchActions.ts` (podcast playback parity)
  - transcript/detail tests under `apps/lite/src/**/__tests__`
  - docs under `apps/docs/content/docs/apps/lite/handoff/features/` and `.../handoff/database*`
- Regression risks:
  - transcript parse edge cases causing silent no-op
  - stale async transcript response overriding active playback
  - IndexedDB growth without bounded cleanup
  - unintended subtitle precedence regressions
- Required verification:
  - parser + cache + playback tests pass
  - no player state-machine regression
  - doc behavior matches implementation

## Forbidden Dependencies
- Do not add heavyweight transcript parsing libraries.
- Do not move transcript cache payloads into localStorage.
- Do not block playback start while waiting for transcript network fetch.
- Do not remove existing external transcript/chapter entrypoints in this instruction.

## Required Patterns
- Keep Zustand atomic selector usage in touched UI/hooks.
- Keep non-blocking side-effect pattern for transcript ingestion (audio first, transcript async).
- Use deterministic request-sequencing guard (`requestId`/equivalent) for transcript apply.
- Keep all failure paths explicit and silent-to-user by default (debug logs only).

## Decision Log
- Required: Yes.
- Record architecture decision and tradeoffs in:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH docs:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/discovery.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`

## Completion
- Completed by: Coder (Codex)
- Commands:
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscript.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscriptCache.test.ts`
  - `pnpm -C apps/lite test:run -- src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `pnpm -C apps/lite test:run -- src/store/__tests__/playerStore.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/discovery/__tests__/appleCacheBehavior.test.ts`
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-10 15:55 CST
