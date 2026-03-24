> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/components.mdx` before starting.

# Task: Implement Skeleton UI System

## Objective
Eliminate layout shifts and improve perceived performance by replacing "Loading..." text with themed skeleton placeholders.

## 1. Create Base Skeleton
- **Path**: `apps/lite/src/components/ui/skeleton.tsx`.
- **Implementation**: Copy the shadcn/ui `Skeleton` component and apply the **Shimmer** style tokens:
  - Container: `bg-muted/30 animate-shimmer`
  - Sub-blocks: `bg-muted` with rounded corners

## 2. Implement Specific Skeletons
- **PodcastCardSkeleton**: Matching the dimensions of `PodcastCard`.
- **EpisodeRowSkeleton**: Matching the layout of `EpisodeRow`.
- **ExploreHeroSkeleton**: For the main carousel.
  - **Rule**: No layout shifts; skeleton heights must match the final UI.

## 3. Refactor View Logic
- **Target**: `ExplorePage.tsx`, `PodcastShowPage.tsx`.
- **Action**: Replace `if (isLoading) return <Loading />` with a grid of skeletons.
  ```tsx
  if (isLoading) return <PodcastGrid>{Array(6).fill(0).map(() => <PodcastCardSkeleton />)}</PodcastGrid>
  ```

## 4. Verification
- **Test**: Throttled network (3G). Navigate to Explore.
- **Check**: The page structure should be visible via skeletons before data arrives.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/design-system/components.mdx` (Loading patterns).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Patch Additions (Integrated)
# Patch: 070-implement-skeleton-ui-system

## Why
Content-level normalization to align with Leadership requirements and prevent execution drift.

## Global Additions
- Add Scope Scan (config, persistence, routing, logging, network, storage, UI state, tests).
- Add Hidden Risk Sweep for async control flow and hot-path performance.
- Add State Transition Integrity check.
- Add Dynamic Context Consistency check for locale/theme/timezone/permissions.
- Add Impact Checklist: affected modules, regression risks, required verification.
- Add Forbidden Dependencies / Required Patterns when touching architecture or cross-module refactors.

## Task-Specific Additions
- Ensure hydration-safe rendering for skeletons.
