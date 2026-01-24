> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Enhance Interactions (Hotkeys & Gestures) [COMPLETED]

## Objective
Make the app feel native by adding keyboard shortcuts and touch gestures.
Dependencies (`react-hotkeys-hook`, `@use-gesture/react`) were installed in Instruction #005.

## 1. Global Hotkeys (`apps/lite/src/hooks/useKeyboardShortcuts.ts`)
- **Action**: Use `useHotkeys` from `react-hotkeys-hook`.
- **Logic**:
  - `Space`: Toggle Play/Pause. **Important**: Use `{ preventDefault: true }` to stop page scrolling.
  - `ArrowLeft/Right`: Seek -/+ 15s.
  - `Cmd+K` / `Ctrl+K`: Open Search.
  - `Esc`: Close Modals/Overlays.
- **Constraint**: Single-key shortcuts (`Space`, `ArrowLeft`, `ArrowRight`) MUST be **disabled** when the user is typing in an `<input>` or `<textarea>` (`enableOnFormTags` is FALSE).
- **Exception**: Global actions `Cmd+K` and `Esc` are allowed even when focus is inside inputs (`enableOnFormTags` is TRUE). `Esc` should still be handled in-component when appropriate (e.g., search input `onKeyDown`) to avoid conflicts.

## 2. Touch Gestures (`apps/lite/src/components/AppShell/FullPlayer.tsx`)
- **Action**: Use `@use-gesture/react`.
- **Gesture**: Swipe Down on the Full Player container.
- **Result**: It should collapse the player (navigate back or update UI state).
- **Implementation**:
  ```ts
  const bind = useDrag(({ movement: [mx, my], cancel, last }) => {
    if (my > 100) { // Threshold
      collapsePlayer();
      cancel();
    }
  }, { axis: 'y' });
  ```

## 3. Verification
- **Test**: Press Space. Audio toggles.
- **Test**: Click into the Search input. Press Space. It should type a space, NOT toggle audio.
- **Test**: Swipe down on Full Player. It collapses.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`.
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
  - Implemented `useKeyboardShortcuts` hook with Play/Pause, Seek, and Escape support.
  - Integrated `usePlayerGestures` (swipe down) in `FullPlayer.tsx`.
- **Verification**:
  - Validated code existence in `useKeyboardShortcuts.ts` and `FullPlayer.tsx`.
