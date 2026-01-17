> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/state-management.mdx` before starting.

# Task: Optimize Zustand Selectors Performance

## Objective
Reduce unnecessary component re-renders by enforcing atomic selectors for all Zustand store subscriptions.

## 1. Audit Subscriptions
- **Search**: Find `usePlayerStore()`, `useSearchStore()`, and `useExploreStore()` calls in `src/components/`.
- **Identification**: Flag any calls that destructure the store without a selector (e.g. `const { progress } = usePlayerStore()`).

## 2. Enforce Atomic Selectors
- **Action**: Change to `const progress = usePlayerStore(s => s.progress)`.
- **Reason**: This ensures the component only re-renders when `progress` changes, not when other irrelevant store keys change.
- **Multi-Select**: Use `useShallow` when multiple fields are required.

## 3. Verification
- **Test**: Open "React DevTools" and enable "Highlight updates when components render".
- **Check**: Play audio. Verify that ONLY the progress-related components flash, not the entire Sidebar or AppShell.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/coding-standards/state-management.mdx` (Selector rules).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
