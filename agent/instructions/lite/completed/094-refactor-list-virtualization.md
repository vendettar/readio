# Task: 094 - Virtualize PodcastEpisodesPage While Preserving Year Grouping UI [COMPLETED]

## Objective
Improve large-episode-list performance in `PodcastEpisodesPage` by replacing manual incremental rendering with grouped virtualization, while preserving current year-separated UI structure.

## Product Decision (Fixed)
1. Keep year-separated episode UI exactly as product structure (year headers remain visible).
2. Migrate rendering to `react-virtuoso` grouped virtualization (`GroupedVirtuoso`), not flat list virtualization.
3. Remove manual incremental loading path (`visibleCount`, `IntersectionObserver`, `loaderRef`) after virtualization migration.
4. Keep existing episode row behavior and actions unchanged (`EpisodeRow`, play actions, library context search).
5. Keep existing “limited feed” notice behavior.
6. Keep page-level container scroll model (do not use `useWindowScroll`).

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No DB/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No query contract changes.
  - No additional API calls introduced.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - Loading/error/empty states remain behaviorally consistent.
- Tests:
  - Add page-level rendering tests for grouped virtualization and row continuity.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Virtualized rendering must not break query loading transitions or fallback feed logic.
- Hot-path performance:
  - Avoid expensive regrouping on every render; memoize derived grouped data.
  - Keep row rendering stable via deterministic keys.
- State transition integrity:
  - Play action, row click, and context behavior must remain intact after virtualization.
  - No stuck loader/spinner state from removed infinite-scroll observer.
- Dynamic context consistency:
  - Country-dependent query keys and feed fallback behavior remain unchanged.

## Implementation Steps (Execute in Order)
1. **Refactor list rendering to grouped virtualization**
   - Update:
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
   - Use `GroupedVirtuoso` from `react-virtuoso`.
   - Build grouped data from full `episodes` array:
     - `groups`: ordered year metadata
     - `groupCounts`: per-year episode count
     - flattened episode array aligned with grouped index mapping.
   - Flattened rows must use stable row identity (prefer `episodeId`; fallback `guid`/`audioUrl+publishedAt`). Do not use raw list index as row key.

2. **Preserve year header UI**
   - Use `groupContent` to render year headers with existing typography style.
   - Ensure each group header visually matches current year separator design.

3. **Preserve episode row behavior**
   - Render each episode with existing `EpisodeRow` props and play callback.
   - Keep `isLast` semantics per year group for divider behavior parity.

4. **Remove manual incremental loading mechanism**
   - Remove:
     - `visibleCount`
     - `hasMore`
     - `loaderRef`
     - `IntersectionObserver` effect
     - loading spinner block used only for incremental fetch simulation.
   - Keep query loading skeleton and error states unchanged.

5. **Keep container scroll model**
   - Keep current page container as scroll host (`overflow-y-auto` container).
   - Do not enable `useWindowScroll`.
   - Ensure virtuoso height/fill strategy aligns with current container layout.

6. **Preserve limited-feed notice behavior**
   - Keep “limited feed” notice rendering logic after episode list.
   - Render the notice outside the virtualized list component, after the list container, to avoid virtualization clipping/visibility regressions.
   - Ensure it still appears when conditions are met after virtualization refactor.

7. **Add tests**
   - Add:
     - `apps/lite/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
   - Cover:
     - year headers are rendered.
     - grouped episode rows render and keep play action wiring.
     - `isLast`/divider behavior remains correct at year boundaries.
     - no `IntersectionObserver` dependency in rendering path.
     - limited-feed notice condition still works.

8. **Documentation sync (atomic)**
   - Update handoff docs to reflect:
     - `PodcastEpisodesPage` now uses grouped virtualization
     - year-grouped UI preserved
     - manual incremental observer removed.

## Acceptance Criteria
- Episodes page remains year-grouped visually.
- Large feeds scroll smoothly with virtualized rendering.
- Episode row interactions (play/navigation behavior) remain unchanged.
- Divider behavior at year boundaries matches previous `isLast` semantics.
- Manual infinite-scroll observer code path is removed.
- Limited-feed notice still appears under the same conditions.

## Required Tests
1. `apps/lite/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
   - group header rendering
   - row interaction continuity
   - year-boundary divider parity (`isLast` semantics)
   - limited-feed notice condition
2. Update mocks as needed for `react-virtuoso` grouped rendering in tests.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
  - `apps/lite/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx` (new)
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
- Regression risks:
  - group-to-item index mapping mismatch
  - divider `isLast` regressions at year boundaries
  - layout height mismatch causing empty viewport
- Required verification:
  - grouped rendering parity checks pass
  - page interaction tests pass

## Forbidden Dependencies
- Do not add alternative virtualization libraries.
- Do not flatten/remove year-grouped information architecture.
- Do not add pagination API changes in this instruction.

## Required Patterns
- Memoized grouped data derivation.
- Deterministic mapping from virtuoso group/item indices to episode records.
- Keep Zustand atomic selector usage in touched components.

## Decision Log
- Required: No.

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH docs listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-11
