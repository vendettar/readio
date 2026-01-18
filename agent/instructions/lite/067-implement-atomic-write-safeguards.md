> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/database.mdx` before starting.

# Task: Implement Atomic Write Safeguards

## Objective
Prevent IndexedDB corruption during power loss or crashes by ensuring all complex data operations are atomic.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Transactional Integrity
- **Rule**: Every multi-table update (e.g., Import, Ingesting Audio + Metadata) MUST be wrapped in a `db.transaction`.
- **Action**: Audit `apps/lite/src/store/` and `apps/lite/src/lib/` for loose database calls.

## 2. Self-Healing on Boot
- **Target**: `useAppInitialization.ts`.
- **Feature**: Add a "Sanity Check" that verifies table counts and reference consistency.
- **Auto-Fix**: If a `local_track` exists without a corresponding `audioBlob`, mark the track as "Corrupted" instead of allowing the app to crash.
- **Integration**: Reuse the integrity checks from Instruction 049.

## 3. Verification
- **Test**: Deliberately stop the browser process during a large file import (simulated).
- **Check**: On next boot, the app should remain functional and identify any partial data for cleanup.
- **Method**: Use a controlled throw inside a Dexie transaction during import, then reload the app and verify self-heal flags corrupted items.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (Reliability section).
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` (Boot-time repair).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D030 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
