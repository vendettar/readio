> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Image Fallback Strategy

## Objective
Prevent "broken image" icons and empty gaps when third-party podcast covers fail to load or are slow.

## 1. Refactor `InteractiveArtwork`
- **Target**: `apps/lite/src/components/interactive/InteractiveArtwork.tsx`.
- **State**: Add `isLoading` and `hasError` local states.
- **Loading Phase**: Show a skeleton or a themed gradient background (`bg-muted/50`) while the image is fetching.
- **Error Phase**: If `onError` fires, replace the image with a standard `Podcast` or `Music` icon from Lucide, centered in the container.
- **Fallback Source**: If a default image URL is configured, use it before showing the icon.

## 2. Optimized Transitions
- **Action**: Use a simple CSS transition (`opacity-0` to `opacity-100`) when the image successfully loads to prevent "image pop".

## 3. Verification
- **Test**: Manually trigger an error by passing a junk URL to the component.
- **Check**: Verify the fallback icon appears and matches the theme colors.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx` (Image fallback behavior).
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx` (Asset loading policy).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
