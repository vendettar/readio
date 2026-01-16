> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Fix Root Layout Performance

## Objective
The current `apps/lite/src/routes/__root.tsx` subscribes to the entire `usePlayerStore` (or at least `progress`) directly or via `useEffect` deps.
This causes the ENTIRE APPLICATION to re-render every time the audio time updates (multiple times per second).
We must isolate this logic.

## 1. Create `GlobalAudioController.tsx`
- **Path**: `apps/lite/src/components/AppShell/GlobalAudioController.tsx`
- **Action**: Extract all `<audio>` ref refs and `useEffect` event listeners from `__root.tsx` into this new component.
- **Structure**:
  - It should render the `<audio />` element (hidden or not).
  - It should handle `timeupdate`, `durationchange`, `play`, `pause`, `ended`.
  - It should handle `restoreProgress`.
  - It should use atomic selectors for `usePlayerStore`.

## 2. Refactor `__root.tsx`
- **Action**: Remove the audio logic.
- **Action**: Render `<GlobalAudioController />` inside the provider but outside the visual layout (or wherever appropriate).
- **Constraint**: Ensure `GlobalAudioController` is always mounted to preserve playback continuity across route changes.
- **Goal**: `__root.tsx` should effectively be static unless the route changes.

## 3. Atomic Selectors
- **Verify**: Ensure `GlobalAudioController` does not do `const { progress } = usePlayerStore()`.
- **Fix**: It should mostly *set* state. If it needs to read state inside an effect, use `usePlayerStore.getState()` to avoid subscription, OR use precise selectors.

## 4. Verification
- **Test**: Play audio.
- **Check**: Open React DevTools -> Profiler -> Record. Ensure `RootLayout` is NOT rendering on every tick. Only `GlobalAudioController` (and the progress bar component) should render.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
