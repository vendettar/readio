# Task: 097 - Extract Shared Explore Carousel Shell [COMPLETED]

## Objective
Remove duplicated carousel container/navigation boilerplate across Explore modules by introducing one shared shell component, while preserving existing UX and runtime behavior exactly.

## Product Decision (Fixed)
1. Add one shared component: `apps/lite/src/components/Explore/CarouselShell.tsx`.
2. Keep `apps/lite/src/components/Explore/CarouselNavigation.tsx` as-is; do not move or rename it.
3. Keep `apps/lite/src/hooks/useCarouselLayout.ts` as the single layout-calculation primitive.
4. Refactor only `PodcastShowsCarousel` and `PodcastEpisodesGrid` to consume `CarouselShell`.
5. Preserve existing snap physics, scroll behavior, hover reveal behavior, and width CSS-variable behavior.
6. Keep existing card rendering and semantics unchanged:
   - `PodcastShowCard` path and `fromLayoutPrefix` behavior remain unchanged.
   - `PodcastEpisodesGrid` row/column grouping and `AnimatedList` behavior remain unchanged.
7. No route, store, caching, or API behavior changes in this instruction.

## Scope Scan (Required)
- Config:
  - No runtime config or env changes.
- Persistence:
  - No schema/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - Only layout-shell refactor for Explore carousels.
- Tests:
  - Add targeted component tests for shell extraction and parity behavior.

## Hidden Risk Sweep (Required)
- Async control flow:
  - `ResizeObserver` + RAF scheduling in `useCarouselLayout` must remain untouched to avoid resize race regressions.
- Hot-path performance:
  - Do not add additional state layers in `CarouselShell`; keep it stateless and render-only.
- State transition integrity:
  - Left/right availability state (`canScrollLeft`, `canScrollRight`) must still be driven solely by `useCarouselLayout`.
- Dynamic context consistency:
  - i18n labels in navigation continue to come from `CarouselNavigation`; `CarouselShell` must not duplicate translation logic.

## Implementation Steps (Execute in Order)
1. **Create shared shell component**
   - Add file:
     - `apps/lite/src/components/Explore/CarouselShell.tsx`
   - Required props:
     - `scrollRef: React.RefObject<HTMLDivElement | null>`
     - `onScrollUpdate: () => void`
     - `cssVarName: '--item-width' | '--column-width'`
     - `itemWidth: number`
     - `viewportClassName: string`
     - `wrapperClassName?: string`
     - `showNavigation?: boolean`
     - `canScrollLeft: boolean`
     - `canScrollRight: boolean`
     - `onNavigate: (direction: 'left' | 'right') => void`
     - `navTopClassName?: string`
     - `navHeightClassName?: string`
     - `navParentGroupName?: 'carousel' | 'grid'`
     - `children: React.ReactNode`
   - Required behavior:
     - Render wrapper `div` with provided wrapper class.
     - Render scroll viewport `div` bound to provided ref and `onScrollUpdate`.
     - Apply width CSS variable on wrapper style with provided `cssVarName` and `itemWidth`.
     - Render `CarouselNavigation` only when `showNavigation` is true.
     - `CarouselShell` may use shell-specific prop names, but it must map internally to existing `CarouselNavigation` props (`topClassName`, `heightClassName`, `parentGroupName`) without changing `CarouselNavigation` API.

2. **Refactor Top Shows carousel to shell**
   - Update:
     - `apps/lite/src/components/Explore/PodcastShowsCarousel.tsx`
   - Replace duplicated wrapper/scroll/navigation JSX with `CarouselShell`.
   - Keep loading skeleton count behavior unchanged (`visibleCount` fallback).
   - Keep class tokens unchanged for visual parity.

3. **Refactor Top Episodes grid carousel to shell**
   - Update:
     - `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
   - Replace duplicated wrapper/scroll/navigation JSX with `CarouselShell`.
   - Keep existing viewport class switching for loading vs non-loading unchanged.
   - Keep existing `ROWS = 3`, column slicing, ranking, and `AnimatedList` behavior unchanged.

4. **Keep layout hook authority unchanged**
   - Keep `apps/lite/src/hooks/useCarouselLayout.ts` API unchanged.
   - Do not inline hook logic into components.

5. **Docs sync (atomic)**
   - Update architecture/discovery docs to record that Explore carousels share a common shell component, while retaining existing behavior.

## Acceptance Criteria
- Explore page visuals remain unchanged for Top Shows and Top Episodes modules.
- Navigation hot-zone reveal and button behavior remain unchanged.
- Scroll snapping and per-breakpoint item width behavior remain unchanged.
- `PodcastShowsCarousel` and `PodcastEpisodesGrid` no longer duplicate viewport/navigation shell markup.
- `useCarouselLayout` remains the single source for carousel layout computation.

## Required Tests
1. Add:
   - `apps/lite/src/components/Explore/__tests__/CarouselShell.test.tsx`
   - Assert viewport ref binding, CSS variable application, and conditional navigation render behavior.
2. Add:
   - `apps/lite/src/components/Explore/__tests__/PodcastShowsCarousel.test.tsx`
   - Assert loading skeleton parity and navigation rendering parity.
3. Add:
   - `apps/lite/src/components/Explore/__tests__/PodcastEpisodesGrid.test.tsx`
   - Assert grid-column rendering parity (`ROWS=3` grouping) and navigation parity.
4. Add a parity assertion for routing payload in shows cards:
   - verify `fromLayoutPrefix` remains passed exactly as before.
5. Stabilize layout-related tests:
   - mock `useCarouselLayout` outputs in component tests.
   - avoid relying on real `ResizeObserver`/container measurement in test assertions.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/Explore/__tests__/CarouselShell.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Explore/__tests__/PodcastShowsCarousel.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Explore/__tests__/PodcastEpisodesGrid.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/Explore/CarouselShell.tsx` (new)
  - `apps/lite/src/components/Explore/PodcastShowsCarousel.tsx`
  - `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
  - `apps/lite/src/components/Explore/CarouselNavigation.tsx` (consumed, no API change)
  - tests under `apps/lite/src/components/Explore/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/discovery.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- Regression risks:
  - accidental class/token drift during extraction
  - accidental navigation visibility behavior drift
  - accidental width CSS variable mismatch (`--item-width` vs `--column-width`)
- Required verification:
  - Explore carousel tests pass
  - full lite test suite passes
  - lite build passes

## Forbidden Dependencies
- Do not add new carousel libraries.
- Do not add new state management layers.
- Do not change Explore route structure or store contracts.

## Required Patterns
- Keep `useCarouselLayout` as single layout authority.
- Keep extraction behavior-preserving and presentation-focused.
- Keep existing Tailwind tokens and hover group semantics.

## Decision Log
- Required: No (behavior-preserving structural refactor).

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite test:run -- src/components/Explore/__tests__/CarouselShell.test.tsx src/components/Explore/__tests__/PodcastShowsCarousel.test.tsx src/components/Explore/__tests__/PodcastEpisodesGrid.test.tsx`
- Date: 2026-02-13
