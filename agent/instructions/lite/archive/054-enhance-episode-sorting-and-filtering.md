> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx` before starting.

# Task: Enhance Episode Sorting & Filtering

## Objective
Enable users to find content efficiently within large podcast shows or the subscription list.

## 1. Implement Filter Bar
- **Target**: `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`.
- **Feature**: Add a small, sticky control bar below the Hero section.
- **Actions**:
  - **Sort**: Newest First (Default), Oldest First.
  - **Filter**: Unplayed Only, Favorited Only.

## 2. State Management
- **Action**: Use local state or TanStack Router search params to drive the filter logic.
- **Default**: Use local component state (do not introduce new router search params in this task).
- **Requirement**: Use `useMemo` to filter the `episodes` array to ensure smooth scrolling.
 - **Rule**: Do not mutate the source episode array; derived view only.

## 3. I18n
- **Keys**: `filter.all`, `filter.unplayed`, `sort.newest`, `sort.oldest`.

## 4. Verification
- **Test**: Select "Oldest First". Verify the episode list reverses.
- **Test**: Select "Unplayed". Verify played episodes disappear.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`.
- Update `apps/docs/content/docs/apps/lite/routing.mdx` (query params if used).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D017 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
