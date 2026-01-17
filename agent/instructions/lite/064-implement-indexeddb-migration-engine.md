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
