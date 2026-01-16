> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Enhance Interactions (Hotkeys & Gestures)

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
- **Constraint**: Ensure shortcuts are **disabled** when the user is typing in an `<input>` or `<textarea>` (the library usually handles this, but verify `enableOnFormTags` is FALSE).

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
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
