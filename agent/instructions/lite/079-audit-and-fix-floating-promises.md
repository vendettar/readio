> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` and `apps/docs/content/docs/apps/lite/coding-standards/state-management.mdx` before starting.

# Task: Audit and Fix Floating Promises

## Objective
Prevent data corruption and inconsistent UI states by ensuring all asynchronous store actions are properly managed and errors are caught.

## 1. Audit Store Actions
- **Scan**: Audit all `async` functions in `apps/lite/src/store/`.
- **Requirement**: All store actions that touch DB/network must **handle errors explicitly**.
- **Handling**:
  - If the store exposes `status`/`isLoading`, update it on error and clear loading in `finally`.
  - If no status exists, log with `logError` and surface a toast via `toast.*Key`.
  - For fire-and-forget async calls, use `void` and handle `.catch()` locally.

## 2. Cancellation Awareness
- **Problem**: Async tasks that finish after a route change.
- **Fix**: Accept an optional `AbortSignal` in store actions and guard state updates with `signal.aborted`.

## 3. Verification
- **Test**: Simulate a database failure (e.g. mock a Dexie error).
- **Check**: Verify the app shows an error state and doesn't hang in a permanent "Loading" spinner.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` (Async Error Handling).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
