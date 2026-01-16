> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Refactor Routing Logic

## Objective
Clean up "Render-time Redirects" and enforce proper TanStack Router patterns.

## 1. Fix `apps/lite/src/routes/index.tsx` Redirect
- **Issue**: It performs a redirect inside the component render body (`if (...) return <Navigate ... />`).
- **Fix**: Move this logic to the `beforeLoad` hook in `src/routes/index.tsx` (or `createFileRoute` options).
- **Code**:
  ```ts
  beforeLoad: ({ context }) => {
    // Access store/context to check if session exists
    // If not, throw redirect({ to: '/files' })
  }
  ```
- **Constraint**: Do NOT use `useEffect` for redirects. It causes layout thrashing. Use `throw redirect()` which is handled by the router before render.

## 2. Verify Other Routes
- Scan other routes for similar patterns.
- Ensure no sensitive logic is exposed before the redirect happens.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.