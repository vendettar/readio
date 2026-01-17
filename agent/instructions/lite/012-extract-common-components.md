> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Extract Common UI Components (DRY)

## Objective
Reduce code duplication by extracting repeated UI patterns (Loading, Empty States, Grids) into reusable components.

## 1. Create `<LoadingSpinner />`
- **Path**: `apps/lite/src/components/ui/loading-spinner.tsx`
- **Props**: `size?: 'sm' | 'md' | 'lg'`, `className?: string`.
- **Implementation**: Use `Loader2` from Lucide or a CSS spinner. Ensure it centers itself if needed or provide a `<LoadingPage />` wrapper.

## 2. Generalize `<EmptyState />`
- **Refactor**: Move `apps/lite/src/components/Files/EmptyState.tsx` to `apps/lite/src/components/ui/empty-state.tsx`.
- **Props**:
  - `icon: React.ElementType`
  - `title: string`
  - `description?: string`
  - `action: ReactNode` (**Mandatory** per UI Patterns. Must be a shadcn `<Button>`).
  - `className?: string`
- **Layout**: Ensure it strictly follows the pattern: Centered Flex Column + Muted Icon + Title + Description + CTA Button.
- **Usage**: Replace the hardcoded empty states in `SubscriptionsPage`, `FavoritesPage`, `HistoryPage`.
- **Cleanup**: Remove the old `Files/EmptyState.tsx` after updating imports.

## 3. Create `<PodcastGrid />`
- **Path**: `apps/lite/src/components/PodcastGrid.tsx`
- **Props**: `children`
- **Implementation**: Encapsulate the responsive grid classes:
  `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6`
- **Usage**: Use in `SubscriptionsPage`, `ExplorePage`.

## 4. Verification
- **Test**: Visit Subscriptions (Empty). Check new EmptyState with CTA.
- **Test**: Visit Subscriptions (Loading). Check new LoadingSpinner.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
