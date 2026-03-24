# Task: 099 - Unify Remote Playback Orchestration and Metadata Mapping [COMPLETED]

## Objective
Eliminate duplicated remote-playback metadata construction and action wiring by introducing shared playback metadata mappers and one orchestration layer, while preserving current runtime behavior.

## Product Decision (Fixed)
1. Add one pure metadata module: `apps/lite/src/lib/player/episodeMetadata.ts`.
2. Add one remote-playback orchestration module: `apps/lite/src/lib/player/remotePlayback.ts`.
3. Keep `apps/lite/src/hooks/useEpisodePlayback.ts` public API unchanged (`playEpisode`, `playSearchEpisode`, `playFavorite`) and refactor it to delegate to the orchestration module.
4. Refactor all duplicated remote-playback call sites to use the same orchestration functions:
   - `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
   - `apps/lite/src/lib/localSearchActions.ts` (favorite/history remote branch)
   - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
   - `apps/lite/src/routeComponents/HistoryPage.tsx` (remote `audioUrl` branch)
5. Preserve local-file playback path in `apps/lite/src/hooks/useFilePlayback.ts` (no behavior migration in this instruction).
6. Preserve session persistence authority:
   - Do not add new direct `DB.upsertPlaybackSession` calls for remote playback.
   - Keep `useSession` as the owner of remote session creation/progress persistence.
7. Preserve transcript ingestion behavior:
   - Remote episode/favorite/history playback keeps `autoIngestEpisodeTranscript` semantics unchanged.
8. Remove redundant `setEpisodeMetadata` writes when metadata is already passed through `setAudioUrl`.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No API contract changes.
- Storage:
  - No localStorage/IndexedDB key changes.
- UI state:
  - No UI redesign; only playback wiring refactor.
- Tests:
  - Add mapper/orchestrator tests and update affected behavior tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - `autoIngestEpisodeTranscript` must remain non-blocking and race-safe across rapid track switches.
- Hot-path performance:
  - Avoid broad Zustand subscriptions; orchestration functions must accept deps and use existing atomic selectors at call sites.
- State transition integrity:
  - Keep `setAudioUrl` then `play()` ordering unchanged for remote flows.
  - Preserve `setSessionId` behavior in history remote resume flow.
- Dynamic context consistency:
  - Artwork and metadata fallback logic must remain consistent across feed/search/favorite/history sources.

## Implementation Steps (Execute in Order)
1. **Create shared metadata mapper module**
   - Add file:
     - `apps/lite/src/lib/player/episodeMetadata.ts`
   - Required exports:
     - `resolvePlaybackArtwork(source, size?)`
     - `mapFeedEpisodeToPlaybackPayload(episode, podcast)`
     - `mapSearchEpisodeToPlaybackPayload(episode, feedUrl?)`
     - `mapFavoriteToPlaybackPayload(favorite)`
     - `mapSessionToPlaybackPayload(session)`
   - Required payload shape:
     - `{ audioUrl, title, artwork, metadata, transcriptUrl }`
   - Required `metadata` shape (behavior-parity contract):
     - `description?: string`
     - `podcastTitle?: string`
     - `podcastFeedUrl?: string`
     - `artworkUrl?: string`
     - `publishedAt?: number` (timestamp, normalized to epoch ms)
     - `duration?: number`
     - `episodeId?: string`
     - `providerPodcastId?: string` (normalized string)
     - `providerEpisodeId?: string` (normalized string)
     - `transcriptUrl?: string`
   - Required behavior:
     - centralize timestamp normalization
     - centralize provider id normalization to string format
     - preserve existing artwork fallback priority per source.

2. **Create remote orchestration module**
   - Add file:
     - `apps/lite/src/lib/player/remotePlayback.ts`
   - Required deps contract:
     - `setAudioUrl`
     - `play`
     - optional `setSessionId`
     - optional `setFileTrackId`
   - Required exports:
     - `playFeedEpisodeWithDeps(...)`
     - `playSearchEpisodeWithDeps(...)`
     - `playFavoriteWithDeps(...)`
     - `playHistorySessionWithDeps(...)`
   - Required behavior:
     - call `setAudioUrl(..., metadata)` then `play()`
     - trigger `autoIngestEpisodeTranscript` only when transcript URL exists
     - for history remote playback, preserve `setSessionId(session.id)` behavior
     - for history remote playback, preserve `setFileTrackId(session.localTrackId ?? null)` behavior.

3. **Refactor `useEpisodePlayback` to delegate**
   - Update:
     - `apps/lite/src/hooks/useEpisodePlayback.ts`
   - Keep exported API unchanged.
   - Remove inline metadata literals; use mapper + orchestration.

4. **Refactor duplicated direct call sites**
   - Update:
     - `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
     - `apps/lite/src/lib/localSearchActions.ts`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
     - `apps/lite/src/routeComponents/HistoryPage.tsx`
   - Replace ad-hoc metadata object construction with shared mapper/orchestration calls.
   - Remove redundant `setEpisodeMetadata(...)` where `setAudioUrl` already receives metadata.
   - Update and simplify `LocalSearchActionDeps` contract to remove obsolete `setEpisodeMetadata` dependency.

5. **Preserve local file flow boundaries**
   - Keep `apps/lite/src/hooks/useFilePlayback.ts` logic unchanged, including subtitle parsing and local session upsert semantics.

6. **Docs sync (atomic)**
   - Update docs to describe centralized remote playback mapping/orchestration ownership and unchanged session persistence boundary.

## Acceptance Criteria
- Remote playback from feed/search/favorites/history still works with unchanged user-visible behavior.
- Metadata shown in MiniPlayer/FullPlayer remains correct across all sources.
- Transcript auto-ingest continues to work for sources that provide transcript URLs.
- Remote playback no longer duplicates large metadata object literals across call sites.
- No new remote DB-write path is introduced outside existing session lifecycle ownership.

## Required Tests
1. Add:
   - `apps/lite/src/lib/player/__tests__/episodeMetadata.test.ts`
   - Verify mapping outputs for feed/search/favorite/history payloads.
2. Add:
   - `apps/lite/src/lib/player/__tests__/remotePlayback.test.ts`
   - Verify `setAudioUrl`/`play` order, transcript trigger conditions, and history `setSessionId` behavior.
3. Update:
   - `apps/lite/src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
   - Keep existing transcript behavior assertions passing after delegation.
4. Add:
   - `apps/lite/src/lib/__tests__/localSearchActions.playback.test.ts`
   - Verify favorite/history remote branches delegate to shared orchestration path and preserve behavior.
5. Add/update:
   - `apps/lite/src/routeComponents/__tests__/HistoryPage.playback.test.tsx`
   - Verify remote history playback preserves `setSessionId(session.id)` and `setFileTrackId(session.localTrackId ?? null)` behavior.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/player/__tests__/episodeMetadata.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/player/__tests__/remotePlayback.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/localSearchActions.playback.test.ts`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/player/episodeMetadata.ts` (new)
  - `apps/lite/src/lib/player/remotePlayback.ts` (new)
  - `apps/lite/src/hooks/useEpisodePlayback.ts`
  - `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
  - `apps/lite/src/lib/localSearchActions.ts`
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
  - `apps/lite/src/routeComponents/HistoryPage.tsx`
  - tests under:
    - `apps/lite/src/lib/player/__tests__/`
    - `apps/lite/src/lib/__tests__/`
    - `apps/lite/src/hooks/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/search.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- Regression risks:
  - metadata field drift after mapper extraction
  - history remote resume semantics drift
  - transcript trigger condition regressions
- Required verification:
  - playback mapping tests pass
  - transcript tests pass
  - full lite test suite and build pass

## Forbidden Dependencies
- Do not add new player/state libraries.
- Do not modify DB schema.
- Do not redesign playback UI.

## Required Patterns
- Shared source-to-payload mapping in `episodeMetadata.ts`.
- Shared remote play action wiring in `remotePlayback.ts`.
- Keep Zustand atomic selectors in touched components/hooks.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `cd apps/lite && pnpm lint`
  - `cd apps/lite && pnpm lint:selectors`
  - `cd apps/lite && pnpm typecheck`
  - `cd apps/lite && pnpm vitest run src/lib/player/__tests__/episodeMetadata.test.ts`
  - `cd apps/lite && pnpm vitest run src/lib/player/__tests__/remotePlayback.test.ts`
  - `cd apps/lite && pnpm vitest run src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `cd apps/lite && pnpm vitest run src/lib/__tests__/localSearchActions.playback.test.ts`
  - `cd apps/lite && pnpm vitest run src/routeComponents/__tests__/HistoryPage.playback.test.tsx`
  - `cd apps/lite && pnpm test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
