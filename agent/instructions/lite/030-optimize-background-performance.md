> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Optimize Background Performance

## Objective
When the app is in the background (tab hidden or minimized), we should stop expensive UI updates (visualizers, progress bars) to save battery, while keeping Audio running.

## 1. Create `usePageVisibility` Hook
- **Path**: `apps/lite/src/hooks/usePageVisibility.ts`.
- **Implementation**: Listen to `document.visibilitychange`. Return `isVisible` (boolean).

## 2. Optimize `GlobalAudioController`
- **Logic**: Even if the page is hidden, `GlobalAudioController` MUST continue processing audio events (timeupdate) to update the store (so `mediaSession` works).
- **Optimization**: However, we can throttle the store updates if `!isVisible`.
  - Current: Update store every ~250ms (on timeupdate).
  - Optimized: If hidden, update store every 1000ms.
  - **Quant**: When hidden, ensure no more than 1 store update per second.

## 3. Optimize Visuals
- **Target**: `apps/lite/src/components/AppShell/FullPlayer.tsx`.
- **Action**: If `!isVisible`, pause any CSS animations (like the "Breathing" logo or rotating artwork).
  - Use `animation-play-state: paused` via a class or style.

## 4. Verification
- **Test**: Play audio. Switch tabs.
- **Check**: Audio continues.
- **Check**: CPU usage of the hidden tab should drop (Chrome Task Manager).
 - **Quant**: Hidden tab shows no visible animation and no UI update faster than 1s.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/performance.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
