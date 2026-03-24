> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` and `apps/docs/content/docs/apps/lite/coding-standards/state-management.mdx` before starting.

# Task: Audit and Fix Floating Promises [COMPLETED]

## Objective
Prevent data corruption and inconsistent UI states by ensuring all asynchronous store actions are properly managed and errors are caught.

## 1. Audit Store Actions
- **Scan**: Audit all `async` functions in `apps/lite/src/store/`.
- **Requirement**: All store actions that touch DB/network must **handle errors explicitly**.
- **Handling**:
  - If the store exposes `status`/`isLoading`, update it on error and clear loading in `finally`.
  - **Default**: When `status`/`isLoading` exists, treat it as the primary UX signal and avoid duplicate error toasts for expected aborts.
  - If no status exists, log with `logError` and surface a toast via `toast.*Key`.
  - For fire-and-forget async calls, use `void` and handle `.catch()` locally.

## 2. Cancellation Awareness
- **Problem**: Async tasks that finish after a route change.
- **Fix**: Accept an optional `AbortSignal` in store actions and guard state updates with `signal.aborted`.

## 3. Additional Rules
- **React Events**: Any async event handler must be `await`ed at callsite or invoked with `void`. Do not ignore returned promises.
- **Fire-and-forget**: If an action is intentionally fire-and-forget, wrap with `void action().catch(logError)` (or equivalent local catch).
- **Linting**: Add/enable a rule (Biome/TS) that flags unhandled promises in `apps/lite/src`.

## 4. Verification
- **Test**: Simulate a database failure (e.g. mock a Dexie error).
- **Check**: Verify the app shows an error state and doesn't hang in a permanent "Loading" spinner.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Completion Notes
- **Strategy**: Enabled Biome `noFloatingPromises` rule as an error to identify unhandled promises.
- **Store Hardening**:
  - Added `AbortSignal` support to `exploreStore`, `playerStore`, `filesStore`, and `historyStore`.
  - Guarded state updates with `signal.aborted` checks and `loadRequestId` comparisons.
  - Prefixed fire-and-forget async calls with `void` to satisfy linter and signal intentionality.
- **UI Hardening**: Fixed multiple `navigate` and event-driven async calls in components.
- **Documentation**: Updated `logic-flow.mdx` with async safety standards.
- **Verification**: Ran `pnpm lint` to ensure zero floating promises remain in `apps/lite`.
- **Date**: 2026-02-05
- **Author**: Antigravity
- **Reviewed by**: Codex
