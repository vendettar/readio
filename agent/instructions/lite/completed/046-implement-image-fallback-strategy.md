> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Image Fallback Strategy [COMPLETED]

## Objective
Prevent "broken image" icons and empty gaps when third-party podcast covers fail to load or are slow.

## 1. Refactor `InteractiveArtwork`
- **Target**: `apps/lite/src/components/interactive/InteractiveArtwork.tsx`.
- **State**: Add `isLoading` and `hasError` local states.
- **Loading Phase (Default)**: Use a simple themed placeholder background (`bg-muted/50`) while the image is fetching (no shimmer/skeleton component).
- **Error Phase (Default)**: If `onError` fires, show the Lucide `Podcast` icon centered in the container.
- **Fallback Source**: Use the configured fallback image (`getFallbackPodcastImage()` / runtime config) before showing the icon.

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

## Completion
- **Status**: 100% Completed
- **Reviewed by**: Antigravity
- **Date**: 2026-01-29
