# Full Code Review Rounds

- Scope: apps/lite/src + packages/core/src (all code each round)
- Date: 2026-02-28

## Round 1 - SSOT + Boundary/Import Governance (001 + 006)

### Coverage
- File inventory baseline: 489 code files (`apps/lite/src` + `packages/core/src`)
- Full-repo pattern scans executed against all files for:
  - direct `db` import/bypass patterns
  - discriminator governance (`sourceType`/guards/constants)
  - type-escape and workaround markers
  - logging path consistency (`console.*` in runtime code)
- Deep-read focus after global scan:
  - repositories, playback pipeline, subtitle version pipeline, and mapping boundaries

### Findings

#### P2 - Subtitle selection policy duplicated in two repositories (SSOT drift risk)
- Evidence:
  - `apps/lite/src/lib/repositories/DownloadsRepository.ts:223`
  - `apps/lite/src/lib/repositories/FilesRepository.ts:68`
- Impact:
  - The same priority algorithm (active-ready first, then newest-ready) exists in two places.
  - Future policy changes can drift between file-track and download-track behavior.
- Fix Direction:
  - Extract shared subtitle-candidate builder into one internal utility/module and reuse in both repositories.
  - Keep only track-type guard logic in each repository.

#### P2 - Downloads domain UI reaches into FilesRepository for track snapshot (cross-domain boundary blur)
- Evidence:
  - `apps/lite/src/components/Downloads/SubtitleVersionSheet.tsx:60`
- Impact:
  - Download subtitle management depends on files-domain repository for `activeSubtitleId` refresh.
  - Weakens ownership boundaries and makes future repo refactors harder to reason about.
- Fix Direction:
  - Add `DownloadsRepository.getTrackSnapshot()` or `DownloadsRepository.getActiveSubtitleId()` and route this read through downloads domain.

#### P2 - Discovery mapper uses sentinel `0` for provider IDs (contract ambiguity)
- Evidence:
  - `apps/lite/src/lib/discovery/mappers.ts:14`
  - `apps/lite/src/lib/discovery/mappers.ts:46`
- Impact:
  - `0` is not a real provider id but is encoded as valid numeric output.
  - Can silently leak invalid identity into downstream logic that assumes real provider ids.
- Fix Direction:
  - Use explicit optional/nullable provider id in mapper output contract.
  - Only coerce to required numeric fields at the final write boundary when truly required.

#### P3 - Runtime error logging bypasses unified logger in playback source
- Evidence:
  - `apps/lite/src/lib/player/playbackSource.ts:36`
  - `apps/lite/src/lib/player/playbackSource.ts:41`
- Impact:
  - `console.error` bypasses centralized logging policy and observability controls.
- Fix Direction:
  - Replace with structured logger (`logError`) and include minimal context payload.

#### P3 - Player remote playback still reads `db.tracks` directly for fallback identity
- Evidence:
  - `apps/lite/src/lib/player/remotePlayback.ts:286`
- Impact:
  - Another direct persistence read path outside repository APIs.
  - Makes store/player domain partially coupled to DB schema details.
- Fix Direction:
  - Provide repository method (`PlaybackRepository.trackExists` or similar) and remove direct `db` read.

### Notes
- No discriminator-literal branch violations found in runtime code; `TRACK_SOURCE` and guard helpers are consistently used.
- This round intentionally targets architecture quality and ownership consistency, not functional regressions.

## Round 2 - Async Race/Cancellation + State Transition Integrity (002 + 003)

### Coverage
- Full-repo async/state pattern sweep on all code files:
  - hits scanned: 410
  - files touched by async/state patterns: 75
- Deep-read focus after global scan:
  - player pipeline (`remotePlayback`, `GlobalAudioController`, `useSession`, `playerStore`)
  - transcript/download orchestration and session recovery flows

### Findings

#### P1 - Dirty-track cleanup path lacks epoch recheck before destructive delete
- Evidence:
  - `apps/lite/src/lib/player/remotePlayback.ts:127`
  - `apps/lite/src/lib/player/remotePlayback.ts:140`
- Impact:
  - `downloadAndResolve` checks epoch before dirty-track branch, but does not re-check right before `removeDownloadedTrack`.
  - If active playback context changes in that window, a stale async branch can still delete track metadata for a no-longer-current flow.
- Fix Direction:
  - Add `if (currentEpoch !== getPlaybackEpoch()) return null` immediately before `removeDownloadedTrack(...)`.
  - Re-check once again before recursive retry call.

#### P2 - Session bootstrap effect can commit stale session identity without request guard
- Evidence:
  - `apps/lite/src/hooks/useSession.ts:74`
  - `apps/lite/src/hooks/useSession.ts:84`
  - `apps/lite/src/hooks/useSession.ts:99`
- Impact:
  - `findOrStartSession` is async but unguarded by request token/identity snapshot.
  - During rapid track changes, a late result can set `sessionId`/progress for an older track.
- Fix Direction:
  - Introduce request token (`sessionResolveRequestId`) or snapshot key (`localTrackId + normalizedAudioUrl`) and verify before each state write.
  - Abort/ignore stale completions.

#### P2 - Invalid explore-session precondition sets `sessionId` before persistence eligibility is validated
- Evidence:
  - `apps/lite/src/hooks/useSession.ts:108`
  - `apps/lite/src/hooks/useSession.ts:116`
- Impact:
  - New session id is pushed to store before verifying required `countryAtSave`.
  - On validation failure path, store may reference non-persisted session id, creating inconsistent state and follow-on "session not found" recovery churn.
- Fix Direction:
  - Validate all hard preconditions first, then assign `sessionId` only after successful `upsertPlaybackSession`.

#### P3 - Direct-session fast path skips duration hydration, unlike fallback path
- Evidence:
  - `apps/lite/src/hooks/useSession.ts:82`
  - `apps/lite/src/hooks/useSession.ts:104`
- Impact:
  - Two branches restoring existing session metadata are not behaviorally aligned.
  - Direct hit path restores progress but not `durationSeconds`, increasing branch divergence and future bug surface.
- Fix Direction:
  - Align both branches: if `durationSeconds` exists, set duration in the direct-session branch too.

### Notes
- Current regressions are mostly race-hardening and state determinism quality issues; they may not surface as immediate user-visible bugs.

## Round 3 - Storage/Retention + Unified Tracks Invariants (005 + 010)

### Coverage
- Full-repo storage/invariant sweep across all code files:
  - schema/index definitions
  - track discriminator usage
  - delete/cascade/reference-counting paths
  - import/export + integrity contracts
- Deep-read focus after global scan:
  - `dexieDb`, `downloadService`, `vault`, `integrity`, `retention`, repositories

### Findings

#### P2 - Root-folder queries only match `folderId = null`, but type contract still allows `undefined`
- Evidence:
  - `apps/lite/src/lib/dexieDb.ts:686`
  - `apps/lite/src/lib/dexieDb.ts:699`
  - `apps/lite/src/lib/db/types.ts:171`
- Impact:
  - `getFileTracksInFolder(null)` and count query are index-bounded on `folderId = null`.
  - If any rows carry `folderId: undefined` (still legal by type), they will be invisible in root-folder views/counts.
- Fix Direction:
  - Normalize invariant to `folderId: string | null` (remove `undefined` at type/runtime boundaries), or explicitly include `undefined` fallback path.

#### P3 - Unsafe raw delete API remains publicly exposed in DB facade
- Evidence:
  - `apps/lite/src/lib/dexieDb.ts:814`
- Impact:
  - `deletePodcastDownload` intentionally bypasses full reference/cascade safety.
  - Keeping this on the public DB surface increases accidental misuse risk outside tests/internal tooling.
- Fix Direction:
  - Restrict visibility (internal/test-only export) or rename with explicit danger marker and usage guard.

### Notes
- Reference-protected subtitle deletion and transactional duplicate-check improvements are now in place and materially improved storage safety.
- Schema remains on a single active `version(5)` by first-release policy; acceptable under current stated constraints, but should be revisited if in-place upgrades are introduced.

## Round 4 - Hot-path Performance + Algorithmic Quality (004)

### Coverage
- Full-repo performance-pattern sweep:
  - query/materialization patterns (`toArray`, filter+count, N+1 lookups)
  - looped async DB calls in frequently-triggered paths
  - list reload paths on subscriber events
- Total perf-pattern hits scanned: 222 across 55 files

### Findings

#### P2 - Subtitle candidate builders perform N+1 subtitle entity lookups
- Evidence:
  - `apps/lite/src/lib/repositories/DownloadsRepository.ts:257`
  - `apps/lite/src/lib/repositories/FilesRepository.ts:101`
- Impact:
  - For each ready subtitle version, repository performs one `db.subtitles.get(...)`.
  - This scales linearly in round-trips and becomes expensive for tracks with many versions.
- Fix Direction:
  - Collect subtitle IDs first, use batched retrieval (`bulkGet`) or pre-indexed map, then assemble candidates.

#### P2 - `removeDownloadedTrack` contains looped counting/deletes and one full-table artwork reference scan inside transaction
- Evidence:
  - `apps/lite/src/lib/downloadService.ts:494`
  - `apps/lite/src/lib/downloadService.ts:496`
  - `apps/lite/src/lib/downloadService.ts:527`
- Impact:
  - Per-subtitle reference counting in a loop and artwork reference `filter(...)` scan increase transaction hold time.
  - Large libraries will see delete latency spikes and higher lock contention risk.
- Fix Direction:
  - Pre-aggregate subtitle ref counts for this track’s subtitleIds.
  - Add indexed artwork reference check path (or add `artworkId` index if needed).

#### P3 - Downloads page reload path fully re-fetches artwork and subtitle lists for all tracks on every download event
- Evidence:
  - `apps/lite/src/routeComponents/DownloadsPage.tsx:221`
  - `apps/lite/src/routeComponents/DownloadsPage.tsx:230`
  - `apps/lite/src/routeComponents/DownloadsPage.tsx:276`
- Impact:
  - Any download-state change triggers full-card metadata reload for entire downloads list.
  - This is simple but not optimal for large lists; unnecessary repeated blob/subtitle reads.
- Fix Direction:
  - Move toward incremental refresh by changed track id(s), or memoized cache keyed by `track.id` + version markers.

### Notes
- Current implementation is functionally correct; issues are about scaling behavior and transaction efficiency.

## Round 5 - Workaround/Patch-Style Code + Elegance/Maintainability Audit (008 + code smell pass)

### Coverage
- Full-repo maintainability scan:
  - workaround markers and deprecated surfaces
  - policy duplication across modules
  - test hooks exposed into runtime boundaries
- Deep-read focus:
  - playback resume policy paths, bootstrap/runtime wiring, repository public surface

### Findings

#### P2 - Resume-completion policy duplicated across modules (drift-prone)
- Evidence:
  - `apps/lite/src/hooks/useSession.ts:11`
  - `apps/lite/src/routeComponents/DownloadsPage.tsx:35`
  - `apps/lite/src/hooks/useSession.ts:188`
  - `apps/lite/src/routeComponents/DownloadsPage.tsx:113`
- Impact:
  - "completed session threshold" and resume reset logic are implemented in multiple places.
  - Small future changes (e.g. threshold tuning) can diverge behavior between auto-restore and manual play.
- Fix Direction:
  - Extract one shared resume policy helper (e.g. `lib/player/resumePolicy.ts`) and reuse both paths.

#### P2 - Test harness is enabled in DEV and exposes `rawDb` on `window`
- Evidence:
  - `apps/lite/src/main.tsx:48`
  - `apps/lite/src/testHarness.ts:12`
  - `apps/lite/src/testHarness.ts:26`
- Impact:
  - Runtime dev sessions expose low-level DB handles globally, which is convenient but broadens accidental misuse surface.
  - Makes boundary discipline weaker by normalizing direct DB poking from outside architecture layers.
- Fix Direction:
  - Restrict `rawDb` exposure to explicit E2E/test flag only, keep DEV default safer.
  - If DEV harness is needed, expose only high-level safe helpers.

#### P3 - Deprecated subtitle APIs remain on public repository surface
- Evidence:
  - `apps/lite/src/lib/repositories/FilesRepository.ts:112`
  - `apps/lite/src/lib/repositories/DownloadsRepository.ts:268`
- Impact:
  - Public deprecated methods increase API surface and maintenance burden.
  - Encourages mixed usage patterns instead of converging on one canonical read path.
- Fix Direction:
  - Mark for removal schedule and migrate all callers to `getReadySubtitlesByTrackId`.
  - Consider keeping deprecated methods in compatibility adapter rather than primary repository.

### Notes
- This round focuses on long-term maintainability quality, not immediate functional correctness.

## Round 6 - Test Gap + Regression Anchoring Audit (009)

### Coverage
- Full test inventory scan over `apps/lite/src/**/__tests__`
- Gap check against findings from Rounds 1-5
- Anchors considered:
  - `src/lib/__tests__/downloadService.db.test.ts`
  - `src/lib/repositories/__tests__/DownloadsRepository.test.ts`
  - `src/lib/player/__tests__/remotePlayback.test.ts`
  - `src/routeComponents/__tests__/DownloadsPage.regression.test.tsx`

### Findings

#### P2 - Missing regression for stale-epoch destructive delete guard in dirty-track remediation
- Evidence:
  - Code path: `apps/lite/src/lib/player/remotePlayback.ts:140`
  - Existing related test does not simulate epoch flip between dirty detection and delete:
    `apps/lite/src/lib/player/__tests__/remotePlayback.asr-fallback.regression.test.ts:31`
- Impact:
  - If future change introduces race between epoch changes and cleanup, no dedicated test will catch accidental stale deletion.
- Required Test:
  - Add a regression that bumps playback epoch right before cleanup and asserts `removeDownloadedTrack` is not called.

#### P2 - Missing invariant test for `folderId: undefined` root-query behavior
- Evidence:
  - Query path: `apps/lite/src/lib/dexieDb.ts:686`
  - Type contract allows undefined: `apps/lite/src/lib/db/types.ts:171`
  - No explicit regression found for undefined-root rows in root-folder listing/count.
- Impact:
  - Potential silent mismatch between stored rows and root-folder results can slip through.
- Required Test:
  - Add DB-level regression covering both `folderId: null` and `folderId: undefined` rows and asserting expected root behavior.

#### P3 - `useSession` reject-path test does not assert store-level consistency (`sessionId` must remain unset)
- Evidence:
  - Existing test only checks DB write absence:
    `apps/lite/src/hooks/__tests__/useSession.test.ts:212`
- Impact:
  - A partial-state bug (session id set in store but not persisted) could pass current test.
- Required Test:
  - Extend test to assert `usePlayerStore.getState().sessionId` remains `null` on reject path.

### Notes
- Current suite is strong on functional happy-path and known regressions; gaps are mostly around race-hardening and invariant edge cases.
