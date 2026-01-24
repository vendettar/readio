> **⚠️ CRITICAL**: Preserve existing UI/UX and runtime behavior. Do NOT change visuals or user-facing text.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Refactor Episode Resolution + Search Hooks

## Objective
Reduce view-layer business logic and split oversized hooks without changing behavior.

## Scope A: Episode resolution extraction
**Current issue**: `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx` contains complex fallback logic for resolving an episode when RSS does not contain the episode ID.

**Target**: Move the resolution logic into a dedicated hook or helper so the component only consumes structured results.

**Required approach (choose one)**:
1) **Hook-based**: Create `apps/lite/src/hooks/useEpisodeResolution.ts` that encapsulates:
   - Param decoding (`episodeId` normalization).
   - Direct feed match.
   - Provider episode fallback query and fuzzy match.
   - Virtual episode fallback when RSS fails.
   - Loading state that matches the current behavior (avoid flash of empty state).
2) **Helper-based**: Create `apps/lite/src/lib/discovery/episodeResolution.ts` for the matching logic and keep data fetching in the component; use the helper to produce the final `episode` result.

**Constraints**:
- No UI changes in the page.
- Preserve `useQuery` keys, `staleTime`, and `gcTime`.
- Do not move logic into `packages/core`.
- Keep all logging and error handling consistent.

## Scope B: Split `useGlobalSearch`
**Current issue**: `apps/lite/src/hooks/useGlobalSearch.ts` handles remote search, local store search, DB scans, dedupe, and badge merging in a single hook.

**Target**: Split into focused hooks and keep `useGlobalSearch` as the aggregator.

**Required structure**:
- `useDiscoverySearch(query, enabled)`:
  - Owns provider search queries (podcasts + episodes).
  - Preserves query keys and caching behavior.
- `useLocalSearch(query, enabled, limits?)`:
  - Owns store search + DB search + badge merge for local results.
  - Preserves limits, dedupe, and badge logic.
- `useGlobalSearch(...)`:
  - Calls both hooks and returns the same public API as today (no callsite changes required).

**Constraints**:
- No behavior regressions in search results ordering or badge merging.
- Keep debounce timing and DB scan limits unchanged.
- Do not introduce new dependencies.

## Required Patterns
- Keep React Query usage in `apps/lite` only.
- All external input parsing stays in view/hook layers with Zod where already used.
- Use selectors for Zustand store reads where applicable.

## Forbidden Dependencies
- No new packages.
- No cross-boundary imports into `packages/core`.

## Impact Checklist
- **Affected modules**: `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`, `apps/lite/src/hooks/useGlobalSearch.ts`, new hook/helper files as needed.
- **Regression risks**:
  - Episode fallback logic mismatches or missing edge cases.
  - Search result ordering or badge merge differences.
  - Loading state regressions (empty flash).
- **Required verification**:
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite lint`

## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` (status only).
- Update `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx` (status only).

## Decision Log
- **Decision Log**: Waived (refactor only; no new architecture).
- **Bilingual Sync**: Required.

## Completion
- **Status**: Completed
- **Date**: 2026-01-24
- **Refactored by**: Refactoring Specialist (AI)
- **Files Touched**:
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
  - `apps/lite/src/hooks/useGlobalSearch.ts`
  - `apps/lite/src/hooks/useDiscoverySearch.ts` (New)
  - `apps/lite/src/hooks/useLocalSearch.ts` (New)
  - `apps/lite/src/hooks/useEpisodeResolution.ts` (New)
- **Verification Steps**:
  - `pnpm --filter @readio/lite typecheck` [PASS]
  - `pnpm --filter @readio/lite lint` [PASS]

