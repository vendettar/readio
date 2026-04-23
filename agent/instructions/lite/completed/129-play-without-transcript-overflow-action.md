# Instruction 129: Add "Play Without Transcript" Overflow Action Across Episode Surfaces [COMPLETED]

## Status
- [x] Active
- [x] Completed

## Hard Dependencies
- `apps/docs/content/docs/general/technical-roadmap.mdx` (sequence/source of truth)
- `agent/instructions/lite/128-align-downloads-density.md` should be completed and reviewed before applying Downloads card overflow updates in this instruction.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/history.zh.mdx`

## Goal
Add a new overflow-menu action on episode cards:
- **Label**: `Play without transcript`
- **Behavior**: play immediately with **existing playable source priority** (**local downloaded audio first, otherwise remote stream**), and **do not trigger download/transcription** for this action.

Target entry points:
- Explore episode rows
- Favorites page rows
- History page rows
- Search result episode rows
- Downloads page cards

## Product Decision (Locked)
1. Keep the current default play behavior unchanged.
2. `Play without transcript` is an explicit alternate action, not a global setting.
3. This action must bypass ASR-gated download and automatic transcript ingestion for the current play request.
4. Transcript UI state must be cleared before playback starts (no stale cues from previous track).
5. In `stream_without_transcript` mode, do not auto-attach any existing subtitle source (local or remote) for the triggered request.
6. If the episode is already downloaded locally, `stream_without_transcript` must reuse local audio (resume progress as usual) and must not switch to remote stream URL for that request.
7. For already-downloaded episodes, this local-first rule is progress-agnostic: regardless of current progress value, clicking `Play without transcript` must not fetch or resolve a streaming URL.
8. No migration/backfill work is required (first-release policy).
9. Files page track overflow menu does not expose `Play without transcript` in this instruction scope.
10. In docked mode, when the request is `stream_without_transcript`, render centered large artwork in the content area (both horizontally and vertically centered).

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite i18n:check`
  - `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
  - `pnpm -C apps/lite test:run -- src/lib/player/__tests__/remotePlayback.test.ts`
  - `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/DownloadsPage.regression.test.tsx`
  - `pnpm -C apps/lite test:run`
- Date: 2026-03-02

## Scope
- `apps/lite/src/lib/player/remotePlayback.ts`
- `apps/lite/src/hooks/useEpisodePlayback.ts`
- `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`
- `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
- `apps/lite/src/routeComponents/FavoritesPage.tsx`
- `apps/lite/src/routeComponents/HistoryPage.tsx`
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- `apps/lite/src/components/Downloads/DownloadTrackCard.tsx`
- `apps/lite/src/components/AppShell/ReadingContent.tsx`
- `apps/lite/src/components/AppShell/PlayerSurfaceFrame.tsx`
- `apps/lite/src/lib/locales/*.ts`
- Tests under:
  - `apps/lite/src/lib/player/__tests__/`
  - `apps/lite/src/hooks/__tests__/`
  - `apps/lite/src/routeComponents/__tests__/`
  - `apps/lite/src/components/**/__tests__/`

## Scope Scan (8 Scopes)
- **Config**: no env/runtime config changes.
- **Persistence**: no schema changes; session persistence semantics remain intact.
  - Allowed writes: normal playback session/progress updates.
  - Forbidden writes: no new `tracks` / `local_subtitles` / `subtitles` / `audioBlobs` persistence as side effect of stream-only action.
- **Routing**: no route shape change.
- **Logging**: preserve existing playback logs; no noisy logs.
- **Network**: stream-only action must avoid ASR/download network paths.
- **Storage**: stream-only action must not create new download/subtitle records.
- **UI state**: transcript store must reset for stream-only action.
- **Tests**: add mode-specific regressions for playback and menu actions.

## Hidden Risk Sweep
- **Async control flow**: keep latest-request-wins semantics; stream-only clicks must not race with in-flight default playback.
- **Hot-path performance**: avoid duplicate playback setup paths; reuse existing remote playback pipeline with explicit mode.

## State Transition Integrity
1. Stream-only action must not leave transcript ingestion state in `loading`/`transcribing`.
2. Playback surface transitions (`mini`/`docked`/`full`) must remain recoverable after stream-only action.
3. Alternating default-play and stream-only clicks must keep latest-request-wins without dead-end player states.

## Dynamic Context Consistency
1. Overflow action label must update immediately on language change.
2. Visibility guards must react to row data changes (`remoteUrl` availability, local-only entries).
3. Playback mode selection must be request-scoped and not leak via module-level mutable state.

## Required Patterns
- Introduce a typed playback mode contract, e.g.:
  - `default`
  - `stream_without_transcript`
- Thread this mode through shared playback APIs instead of page-level ad-hoc branches.
- Keep one authoritative decision point in `remotePlayback` for:
  - whether ASR-gated download is allowed
  - whether `autoIngestEpisodeTranscript` is executed
- For stream-only mode, clear transcript store via canonical action (`resetTranscript` or equivalent SSOT path).
- Keep existing surface policy behavior (`docked/mini`) unchanged.

## Forbidden Dependencies
- No new package dependencies.
- No duplicated “playback fork” utility per page.
- No inline one-off bypass flags hardcoded only in components.

## Execution Path

### Phase 1: Shared Playback Mode Contract
1. Define playback mode type and propagate it across `useEpisodePlayback` and `remotePlayback` entry points.
2. Ensure the default path remains byte-for-byte equivalent in behavior.

### Phase 2: Stream-Only Behavior
1. In stream-only mode:
   - skip ASR-gated download path entirely.
   - skip `autoIngestEpisodeTranscript` entirely.
   - skip auto-restore/auto-attach of any local subtitle payload for the current request.
   - clear transcript state before applying final source URL.
2. Preserve existing session id / track id / progress restore logic where applicable.
3. Mode is strictly request-scoped:
   - stream-only applies only to the triggering action.
   - subsequent default play requests must follow normal default behavior.
4. Docked visual behavior:
   - for `stream_without_transcript`, docked content area shows centered large artwork instead of plain no-transcript text.
   - this artwork state must be request-scoped and must not leak into default-play requests.

### Phase 3: UI Entry Points (Overflow Menus)
1. Add overflow menu item with translated label on:
   - `EpisodeRow` (covers Explore podcast episode lists)
   - `FavoritesPage`
   - `HistoryPage`
   - `SearchEpisodeItem`
   - `DownloadTrackCard` (add 3-dot menu if absent)
2. History/Downloads visibility rules:
   - show action only when a valid remote URL exists and direct stream is possible.
   - hide action for purely local-only sessions.
   - when offline (or network unavailable), hide or disable this action consistently with existing surface policy.
3. URL source resolution must be centralized in shared playback layer (no per-page ad-hoc URL stitching).
   - Define one deterministic precedence rule for remote stream target selection and reuse it across all entry points.

### Phase 4: Localization + Documentation
1. Add i18n keys for EN/ZH/JA/KO/DE/ES locale files.
2. Update handoff docs (EN + ZH) with mode contract and entry points.

## Acceptance Criteria
1. Every listed target surface exposes `Play without transcript` in 3-dot menu when applicable.
2. Triggering this action starts playback immediately, prefers local downloaded audio when present (otherwise remote stream), and does not trigger ASR download/transcribe.
3. Transcript panel does not show stale transcript after stream-only action.
4. Default Play button behavior remains unchanged.
5. Downloads/History local-only entries do not show invalid stream-only action.
6. Latest-request-wins remains intact under rapid alternating clicks between default play and stream-only play.
7. i18n strings are present in all supported locales.
8. Stream-only request does not auto-load existing local subtitles from Downloads/History context.
9. Stream-only request introduces no new `tracks/local_subtitles/subtitles/audioBlobs` persistence writes.
10. Offline state handling for this action is consistent (hidden or disabled by one policy across surfaces).
11. For already-downloaded episodes, stream-only action reuses local audio source and still suppresses subtitle attachment for that request.
12. In docked mode stream-only playback, centered large artwork is visible and no stale transcript text placeholder is shown.

## Tests (Required)
- **Unit (remote playback mode)**
  - stream-only mode skips `downloadEpisode`.
  - stream-only mode skips `autoIngestEpisodeTranscript`.
  - default mode still runs existing behavior.
- **Hook (useEpisodePlayback)**
  - mode is correctly forwarded for episode/search/favorite handlers.
- **UI integration**
  - each target menu renders the new item.
  - selecting item dispatches stream-only playback path.
  - visibility guard tests for local-only History/Downloads entries.
  - docked stream-only visual test: centered large artwork appears for stream-only request and clears on default-play request.
- **Regression**
  - no stale transcript remains after stream-only action.
  - Downloads/History stream-only action does not auto-attach existing local subtitle rows.
  - stream-only request has no download/subtitle persistence side effects (only normal playback session updates allowed).

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite i18n:check`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run -- src/lib/player/__tests__/remotePlayback.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useEpisodePlayback.surface.test.ts`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- **Affected modules**:
  - playback orchestration (`remotePlayback`, `useEpisodePlayback`)
  - episode-row overflow actions across multiple pages
  - locale catalogs and handoff docs
- **Regression risks**:
  - accidental change to default play flow
  - stale transcript state leak
  - duplicate playback triggers from mixed menu/button interactions
- **Required verification**:
  - all commands above pass
  - manual smoke across Explore/Favorites/History/Search/Downloads

## Decision Log
- **Required**: Yes.
- Add one entry to `apps/docs/content/docs/general/decision-log.mdx` documenting:
  - why stream-only is an explicit action rather than a global toggle
  - why playback mode contract is centralized in shared playback layer
  - risk handling for transcript state reset and race conditions

## Bilingual Sync
- **Required**: Yes.
- Update both EN/ZH:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/history.zh.mdx`
