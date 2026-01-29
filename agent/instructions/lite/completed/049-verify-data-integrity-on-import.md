> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/database.mdx` before starting.

# Task: Verify Data Integrity on Import [COMPLETED]

## Objective
Harden the Vault/OPML import process by performing business-level validation after the initial JSON/XML parse.

## 1. Integrity Checker (`apps/lite/src/lib/integrity.ts`)
- **Action**: Create a `verifyIntegrity(data)` function.
- **Checks**:
  - **Dangling References**: Ensure `local_subtitles` correctly point to existing `local_tracks`.
  - **UUID Uniqueness**: Ensure no duplicate IDs exist in the incoming dataset.
  - **Timestamp Sanity**: Ensure `addedAt` and `lastPlayedAt` are valid numbers/dates and not in the future.
  - **De-duplication**: Ensure no duplicate `feedUrl` or `key` entries remain after import.
  - **Cross-Table**: Ensure `playback_sessions.localTrackId`, `audioId`, and `subtitleId` references exist.

## 2. Import Workflow Integration
- **Target**: `apps/lite/src/lib/vault.ts` and `opmlParser.ts`.
- **Action**: Call `verifyIntegrity` after Zod validation.
- **Result**: If integrity check fails, throw a specific error and prevent the DB write.

## 3. Verification
- **Test**: Attempt to import a modified JSON with an invalid `trackId` reference.
- **Check**: Verify the import is rejected with a clear toast error.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (Import validation rules).
- Update `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx` (OPML import integrity).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D012 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: 100% Completed
- **Reviewed by**: Antigravity
- **Date**: 2026-01-29
