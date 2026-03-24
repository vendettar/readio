# Task: 102 - Unify Episode Row Data Model and Interaction Surface [COMPLETED]

## Objective
Unify duplicated episode-row mapping and interaction logic across Podcast, Search, Favorites, and History surfaces into one shared model + shared row container, while preserving current UX and playback behavior.

## Product Decision (Fixed)
1. Add one shared mapping module: `apps/lite/src/components/EpisodeRow/episodeRowModel.ts`.
2. Add one shared interaction hook: `apps/lite/src/components/EpisodeRow/useEpisodeRowFavoriteAction.ts`.
3. Add one shared row container component: `apps/lite/src/components/EpisodeRow/EpisodeListItem.tsx`.
4. Keep `BaseEpisodeRow` as the presentational primitive and keep `GutterPlayButton` fallback behavior unchanged.
5. Refactor these call sites to consume the shared row system:
   - `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`
   - `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
   - `apps/lite/src/routeComponents/FavoritesPage.tsx`
   - `apps/lite/src/routeComponents/HistoryPage.tsx`
6. Keep playback ownership unchanged:
   - `onPlay` continues to be provided by each page/caller.
   - No new playback orchestration is introduced in this instruction.
7. Keep navigation semantics unchanged:
   - same route target `/podcast/$id/episode/$episodeId`
   - same `search` payload fields where they already exist.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema/storage changes.
- Routing:
  - No route changes.
- Logging:
  - Keep existing error logging points for favorite failures.
- Network:
  - Keep existing `SearchEpisodeItem` fallback fetch behavior for missing `feedUrl`.
- Storage:
  - No localStorage/IndexedDB key changes.
- UI state:
  - Behavior-preserving row-system consolidation only.
- Tests:
  - Add mapper tests, hook tests, and row parity tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Search favorite add path must keep `isSaving` and async error handling semantics.
- Hot-path performance:
  - Avoid full-store subscription in row components; keep atomic selectors only.
- State transition integrity:
  - Favorite toggle state must remain deterministic under fast repeated clicks.
- Dynamic context consistency:
  - Date/time/duration localization must still respond to language changes.

## Implementation Steps (Execute in Order)
1. **Create shared row model module**
   - Add:
     - `apps/lite/src/components/EpisodeRow/episodeRowModel.ts`
   - Required exports:
     - `type EpisodeRowModel`
     - `fromEpisode(...)`
     - `fromSearchEpisode(...)`
     - `fromFavorite(...)`
     - `fromPlaybackSession(...)`
   - Required behavior:
     - centralize `stripHtml`, `formatRelativeTime`/`formatDateStandard`, and `formatDuration` mapping decisions.
     - centralize artwork fallback resolution.
     - centralize navigation param derivation for podcast detail routes.
     - preserve History navigation fallback:
       - if `providerPodcastId` is missing, keep existing subscription-map fallback behavior for route param derivation.
     - explicit boundary:
       - History/Favorites bottom-meta formatting stays at route level and is not migrated into shared row model.

2. **Create shared favorite-action hook**
   - Add:
     - `apps/lite/src/components/EpisodeRow/useEpisodeRowFavoriteAction.ts`
   - Required hook contract:
     - `toggleFavorite()`
     - `favorited`
     - `isSaving`
   - Required behavior:
     - preserve existing search favorite add flow (`feedUrl` path first, lookup fallback second).
     - preserve toast + error logging behavior when add/remove fails.
     - keep key construction compatibility (`feedUrl::audioUrl`) with existing favorites store.

3. **Create unified row container component**
   - Add:
     - `apps/lite/src/components/EpisodeRow/EpisodeListItem.tsx`
   - Required props:
     - `model: EpisodeRowModel`
     - `onPlay: () => void`
     - `favorite?: { enabled: boolean; favorited: boolean; isSaving?: boolean; onToggle: () => void }`
     - `menu?: React.ReactNode`
     - `descriptionLines?: number`
     - `isLast?: boolean`
   - Required behavior:
     - always render through `BaseEpisodeRow`.
     - preserve no-artwork fallback with `GutterPlayButton`.
     - keep current favorite button reveal behavior (`group-hover/episode`, `focus-visible`).

4. **Refactor existing row implementations to thin wrappers**
   - Update:
     - `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`
     - `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
   - Required behavior:
     - wrappers only prepare source-specific model + callbacks.
     - remove duplicated formatting and JSX assembly moved into shared layer.

5. **Refactor Favorites and History list rows**
   - Update:
     - `apps/lite/src/routeComponents/FavoritesPage.tsx`
     - `apps/lite/src/routeComponents/HistoryPage.tsx`
   - Required behavior:
     - list rendering uses `EpisodeListItem` for row body.
     - History-specific progress/date bottom meta and delete action remain unchanged.
     - Favorites-specific "added at" bottom meta remains unchanged.
     - keep existing route-level formatters for bottom meta unchanged; do not replace with shared mapper formatting.

6. **Maintain export surface**
   - Update:
     - `apps/lite/src/components/EpisodeRow/index.ts`
   - Export new shared row/model utilities used by call sites.

7. **Docs sync (atomic)**
   - Update docs to record the new episode-row shared model/container ownership and reduced duplication boundaries.

## Acceptance Criteria
- Podcast show/episodes, Search results, Favorites, and History still render with current visual behavior.
- Favorite add/remove behavior remains unchanged across all four surfaces.
- Search favorite add still works when `feedUrl` is missing.
- Row formatting logic is no longer duplicated across these files.
- `BaseEpisodeRow` remains the only presentational row primitive.

## Required Tests
1. Add:
   - `apps/lite/src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`
   - Assert mapping parity for episode/search/favorite/session inputs.
2. Add:
   - `apps/lite/src/components/EpisodeRow/__tests__/useEpisodeRowFavoriteAction.test.tsx`
   - Assert add/remove flows, async fallback path, and toast/error behavior.
3. Add:
   - `apps/lite/src/components/EpisodeRow/__tests__/EpisodeListItem.test.tsx`
   - Assert no-artwork gutter fallback, subtitle/meta rendering, and favorite button visibility state classes.
4. Add or update route-level parity tests:
   - `apps/lite/src/routeComponents/__tests__/HistoryPage.row-render.test.tsx`
   - `apps/lite/src/routeComponents/__tests__/FavoritesPage.row-render.test.tsx`
   - Assert play callback wiring, favorite toggle action wiring, and bottom-meta visibility.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`
- `pnpm -C apps/lite test:run -- src/components/EpisodeRow/__tests__/useEpisodeRowFavoriteAction.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/EpisodeRow/__tests__/EpisodeListItem.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/HistoryPage.row-render.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/FavoritesPage.row-render.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/EpisodeRow/episodeRowModel.ts` (new)
  - `apps/lite/src/components/EpisodeRow/useEpisodeRowFavoriteAction.ts` (new)
  - `apps/lite/src/components/EpisodeRow/EpisodeListItem.tsx` (new)
  - `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`
  - `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
  - `apps/lite/src/routeComponents/FavoritesPage.tsx`
  - `apps/lite/src/routeComponents/HistoryPage.tsx`
  - `apps/lite/src/components/EpisodeRow/index.ts`
  - tests under:
    - `apps/lite/src/components/EpisodeRow/__tests__/`
    - `apps/lite/src/routeComponents/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/search.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- Regression risks:
  - row visual parity drift after consolidation
  - favorite-key mismatch across sources
  - Search async favorite fallback regressions
- Required verification:
  - row-system tests pass
  - Favorites/History parity tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new state-management libraries.
- Do not redesign list-row UI.
- Do not change route contracts.

## Required Patterns
- Keep `BaseEpisodeRow` as presentation authority.
- Keep container logic in thin wrappers and shared hooks.
- Keep Zustand atomic selectors in all touched row components.

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
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`
  - `pnpm -C apps/lite test:run -- src/components/EpisodeRow/__tests__/useEpisodeRowFavoriteAction.test.tsx`
  - `pnpm -C apps/lite test:run -- src/components/EpisodeRow/__tests__/EpisodeListItem.test.tsx`
  - `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/HistoryPage.row-render.test.tsx`
  - `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/FavoritesPage.row-render.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
