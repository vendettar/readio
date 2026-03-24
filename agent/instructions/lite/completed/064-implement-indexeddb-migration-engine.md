> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/database.mdx` before starting.

# Task: Implement IndexedDB Migration Engine

## Objective
Establish a non-destructive path for schema updates, replacing the "wipe-on-change" policy with professional data migrations.

## 1. Configure Dexie Versions
- **Target**: `apps/lite/src/lib/dexieDb.ts`.
- **Action**: Stop using a single version. Define `db.version(1)`, `db.version(2)`, etc.
- **Rule**: Every schema change from this point forward MUST increment the version number.

## 2. Migration Hooks
- **Action**: Use `.upgrade(trans => { ... })` for complex changes (e.g., renaming fields or moving data between tables).
- **Constraint**: Ensure `createId()` is used if new primary keys are added during migration.

## 3. Verification
- **Test**: Define a dummy migration that adds a new field `isArchived` to all folders.
- **Check**: Verify that existing data is preserved and the new field is populated after reload.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (Versioning & Migration policy).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D027 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Patch Additions (Integrated)
# Patch: 064-implement-indexeddb-migration-engine

## Why
Instruction 064 defines versioning but lacks guidance for migration safety, backward compatibility, and verification of data integrity across upgrades.

## Additions / Clarifications
- **Migration Safety**: Each migration must be idempotent and handle partial data (missing fields) without throwing.
- **Audit Trail**: Log migration start/end (using local logger if available) with version numbers.
- **Rollback Strategy**: If migration fails, surface a blocking error state and instruct user to export and re-import data (no silent wipe).
- **Test Matrix**: At least two version jumps must be tested (v1→v2, v2→v3) using seeded sample data.

## Verification (add)
- Simulate a failed migration and confirm app surfaces the error state instead of silently clearing data.
