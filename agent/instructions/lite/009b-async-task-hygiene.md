> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` and `apps/docs/content/docs/apps/lite/coding-standards/state-management.mdx` before starting.

# Task: Async Task Hygiene (Timers, Debounce, Cleanup) [COMPLETED]

## Completion
- **Completed by**: Antigravity (Advanced Agentic Coding)
- **Date**: 2025-05-22
- **Reviewed by**: codex
- **Files Modified**:
  - `apps/lite/src/hooks/useCarouselLayout.ts`
  - `apps/lite/src/hooks/useSession.ts`
  - `apps/lite/src/lib/fetchUtils.ts`
  - `apps/lite/src/hooks/useFolderManagement.ts`
  - `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`
  - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
  - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`
- **Verification**: Added `cancelAnimationFrame` cleanups, `requestId` guards for async routes, and ref-based guards for session creation re-entrancy. Fixed external signal listener leak in `fetchUtils`.

## Objective
Prevent async re-entrancy, redundant awaits, and cleanup leaks across the app:
- Ensure timers/intervals/RAF/debounce are cancelled on unmount.
- Ensure async tasks are gated against stale updates (requestId/AbortSignal).
- Ensure guard/initialization logic avoids blocking on redundant async work.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## Impact Checklist
- **Affected modules**: `apps/lite/src/hooks/**`, `apps/lite/src/components/**`, `apps/lite/src/lib/**`, `apps/lite/src/store/**`
- **Regression risks**: Duplicate async work, stuck loading states, memory leaks, unnecessary IO on rapid navigation.
- **Required verification**: `pnpm --filter @readio/lite exec tsc --noEmit`, `pnpm --filter @readio/lite exec biome check .`

## Required Patterns
- Cancel timers/intervals/RAF in `useEffect` cleanup.
- Gate async state updates with `AbortSignal` or requestId checks.
- Avoid redundant awaits when an operation is already in progress.

## Forbidden Dependencies
- No new dependencies.

## Steps
1. **Async lifecycle scan**:
   - Identify timers, intervals, debounced callbacks, and RAF usage.
   - Identify async operations that can resolve after unmount.
2. **Cleanup and gating**:
   - Add cleanup for timers/intervals/RAF.
   - Add requestId/AbortSignal guards to prevent stale updates.
3. **Guarded async flows**:
   - Ensure guard/initialization logic does not block on redundant async work.
4. **Tests**:
   - Update/add tests for any changed async behavior or cancellation paths.
5. **Docs**:
   - Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` and `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx` with the async hygiene rules applied.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
- `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
