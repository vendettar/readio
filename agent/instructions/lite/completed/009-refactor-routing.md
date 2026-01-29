> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Refactor Routing Logic [COMPLETED]

## Objective
Clean up "Render-time Redirects" and enforce proper TanStack Router patterns.

## 1. Fix `apps/lite/src/routes/index.tsx` Redirect
- **Issue**: It performs a redirect inside the component render body (`if (...) return <Navigate ... />`).
- **Fix**: Move this logic to the `beforeLoad` hook in `src/routes/index.tsx` (or `createFileRoute` options).
- **Code**:
  ```ts
  beforeLoad: async ({ context }) => {
    // Access store/context to check if session exists
    // If not, throw redirect({ to: '/files' })
  }
  ```
- **Constraint**: Do NOT use `useEffect` for redirects. It causes layout thrashing. Use `throw redirect()` which is handled by the router before render.

## 2. Verify Other Routes
- Scan other routes for similar patterns.
- Ensure no sensitive logic is exposed before the redirect happens.

## 3. Verification
- **Test**: Load `/` with no session. Should redirect before render (no flash).
- **Test**: Load `/` with a valid session. Should render player normally.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/routing.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Antigravity (Advanced Agentic Coding)
- **Date**: 2025-05-22
- **Reviewed by**: Codex
- **Files Modified**:
  - `apps/lite/src/routes/index.tsx`
  - `apps/docs/content/docs/apps/lite/routing.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`
- **Verification**: Moved redirect logic from `useEffect` to `beforeLoad` hook in index route. Verified with type check and lint.
