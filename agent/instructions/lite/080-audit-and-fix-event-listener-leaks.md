> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/performance.mdx` before starting.

# Task: Audit and Fix Event Listener Leaks

## Objective
Eliminate memory leaks caused by global event listeners (window, document) that are not properly cleaned up when components unmount.

## 1. Implement Standard Listener Hook
- **Target**: Ensure `apps/lite/src/hooks/useEventListener.ts` is the only way to add **window/document** listeners in React components.
- **Audit**: Search for manual `addEventListener` in `src/components/` and `src/hooks/`.

## 2. Refactor
- **Action**: Replace manual listeners with the `useEventListener` hook.
- **Check**: Ensure `removeEventListener` is called in the `useEffect` cleanup function.
  - **Exception**: Non-React modules may attach listeners only during app boot, and must expose explicit cleanup for tests.

## 3. Verification
- **Test**: Use Chrome DevTools "Performance" tab. Record a session where you navigate rapidly between 20+ routes.
- **Check**: The number of "Event Listeners" should not climb indefinitely; it should return to a baseline after navigation.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/performance.mdx` (Event Management section).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
