> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Cleanup Magic Values & Hardcoded Assets [COMPLETED]

## Objective
Remove all "escape hatch" Tailwind values (`-[...]`) and hardcoded colors in assets to ensure full theme compatibility and consistency.

## 1. Eliminate Tailwind Arbitrary Values
- **Target**: `apps/lite/src/components/Selection/SelectionUI.tsx`.
- **Action**: Replace `z-[1000]` with `z-50` (Standard Overlay). If it needs to be higher than a dialog, use `z-100`, but do NOT use arbitrary values.
- **Target**: `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`.
- **Action**: Replace `leading-[1.15]` with `leading-tight` (Standard Token).

## 2. Refactor SVG Assets
- **Targets**: `apps/lite/src/assets/readio.svg`, `public/readio.svg`.
- **Action**: Change `fill="#54808C"` to `fill="currentColor"`.
- **Usage**: Update `Sidebar.tsx` to apply `text-primary` to the Logo container to control its color.

## 3. Centralize Timeouts
- **Action**: In `apps/lite/src/constants/app.ts`, export `export const UI_FEEDBACK_DURATION = 2000;`.
- **Target**: `apps/lite/src/components/Transcript/TranscriptErrorFallback.tsx`.
- **Action**: Replace `2000` with the new constant.

## 4. Verification
- **Check**: Toggle accent colors in Settings. The App Logo should now change color with the theme.
- **Check**: No `-[...]` classes should remain in the modified files.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/design-system/index.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: Completed
- **Date**: 2026-01-23
- **Completed by**: Antigravity (AI Assistant)
- **Reviewed by**: Readio Leadership (Architecture Review)
- **Commands**: 
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite lint`
- **Key Changes**:
  - Replaced `z-[1000]` with `z-50` in `SelectionUI.tsx`.
  - Replaced `leading-[1.15]` with `leading-tight` in `PodcastEpisodeDetailPage.tsx`.
  - Replaced hardcoded fill color in `readio.svg` with `currentColor`.
  - Centralized `UI_FEEDBACK_DURATION` constant.
