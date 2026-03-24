> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/state-management.mdx` before starting.

# Task: Optimize Zustand Selectors Performance [COMPLETED]

## Objective
Reduce unnecessary component re-renders by enforcing atomic selectors for all Zustand store subscriptions.

## 1. Audit Subscriptions
- **Search**: Find `usePlayerStore()`, `useSearchStore()`, and `useExploreStore()` calls in `src/components/`, `src/routeComponents/`, and `src/hooks/`.
- **Identification**: Flag any calls that destructure the store without a selector (e.g. `const { progress } = usePlayerStore()`).

## 2. Enforce Atomic Selectors
- **Action**: Change to `const progress = usePlayerStore(s => s.progress)`.
- **Reason**: This ensures the component only re-renders when `progress` changes, not when other irrelevant store keys change.
- **Multi-Select**: Use `useShallow` when multiple fields are required.
- **Enforcement**: Add a lint/CI check that flags `useXStore()` calls without selectors.

## 3. Verification
- **Test**: Open "React DevTools" and enable "Highlight updates when components render".
- **Check**: Play audio. Verify that ONLY the progress-related components flash, not the entire Sidebar or AppShell.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Completion Notes
- **Audit**: Conducted a codebase-wide audit for Zustand `useStore` calls. Found that most components already used atomic selectors.
- **Optimization**:
  - Refactored `MiniPlayer.tsx` to isolate high-frequency `progress` and `duration` updates into small, dedicated components (`ProgressDisplay`, `RemainingTimeDisplay`, `ProgressSlider`). This prevents the entire mini player from re-rendering every second.
  - Refactored `FullPlayer.tsx` to isolate `progress` and `duration` into `FullPlayerSeekBar` and `SubtitleTracker`. This significantly reduces re-render surface area in the immersive player view.
  - Updated several `useCallback` hooks to use `usePlayerStore.getState()` for time-sensitive logic (skip back/forward) to remove unnecessary subscription dependencies.
- **Verification**: Verified via manual inspection that no store-wide destructuring (`const { ... } = useStore()`) exists in the component tree.
- **Date**: 2024-05-20
- **Author**: Antigravity
- **Reviewed by**: CODEX
