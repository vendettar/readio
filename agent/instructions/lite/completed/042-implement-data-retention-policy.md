> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Data Retention Policy [COMPLETED]

## Objective
Prevent unbounded growth of IndexedDB history by adding an automatic retention policy for `playback_sessions` (and related history data).

## 1. Define Retention Rules
- **Policy**: Keep the most recent **1000** sessions OR **last 6 months**, whichever is smaller.
- **Rule**: Prune in a background task during app boot without blocking UI.

## 2. Implement Pruning
- **Location**: Add a retention utility in `apps/lite/src/lib/retention.ts` (or similar).
- **Trigger**: Call from app boot sequence (after DB ready).
- **Behavior**:
  - Identify sessions older than retention window.
  - Delete in batches to avoid blocking.

## 3. Verification
- **Test**: Seed >1000 sessions; verify pruning keeps latest 1000.
- **Test**: Seed sessions older than 6 months; verify older entries are removed.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (retention policy).
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` (boot-time maintenance).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D009 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: 100% Completed
- **Reviewed by**: Antigravity
- **Date**: 2026-01-29
