> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` before starting.

# Task: Audit & Fix Async Race Conditions

## Objective
Prevent UI/Store inconsistencies caused by rapid user interactions or slow network responses.

## 1. Implement Request Tracking
- **Pattern**: For every async Store action (e.g., `setAudioUrl`, `fetchEpisodes`), maintain a `currentRequestId`.
- **Logic**: 
  ```ts
  const id = ++requestId;
  const data = await fetch();
  if (id !== currentRequestId) return; // Ignore stale response
  ```

## 2. AbortController Integration
- **Target**: `src/lib/fetchUtils.ts` and all API hooks.
- **Action**: Automatically abort previous requests when a new request for the same resource is initiated.

## 3. Playback Lock
- **Action**: Prevent `play()` from being called while `load()` is still pending (already partially addressed in 026, but needs strict enforcement).

## 4. Verification
- **Test**: Rapidly click "Play" on 5 different episodes in 1 second.
- **Check**: Verify the player only attempts to play the FINAL episode and doesn't trigger multiple overlapping audio streams.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` (Async patterns).
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D031 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
