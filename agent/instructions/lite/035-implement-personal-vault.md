> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Feature - Personal Vault (Full Data Export)

## Objective
Allow users to backup and restore their entire application metadata (Subscriptions, Favorites, History, Folders). 
**Note**: Blobs (Audio/Subtitle files) are EXCLUDED from the vault to keep the backup size small and prevent IndexedDB quota issues during import.

## 1. Create Vault Utility (`apps/lite/src/lib/vault.ts`)
- **Action**: Implement `exportVault()` and `importVault(json)`.
- **Export Scope**: 
  - `folders`, `local_tracks`, `local_subtitles`, `subscriptions`, `favorites`, `playback_sessions`.
  - **MANDATORY**: Exclude `audioBlobs` and `subtitles` (blob content) tables.
- **Format**: A single JSON object containing all tables.
- **Versioning**: Include top-level `version` and `exportedAt` fields. Reject imports with unknown versions.

## 2. Confirmation UI
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx`.
- **Import Requirement**: Before overwriting the database, you MUST show a `ConfirmAlertDialog` (from `src/components/ui/confirm-alert-dialog.tsx`).
- **I18n**: All UI strings (Button labels, dialog title, description, toasts) MUST use `t()` with keys added to `apps/lite/src/lib/translations.ts`.
  - Keys: `settings.exportVault`, `settings.importVault`, `settings.vaultConfirmTitle`, etc.

## 3. Data Ingestion
- **Logic**: Use `db.transaction` to clear existing metadata tables and `bulkAdd` the new data.
- **Validation**: Validate the imported JSON structure using a Zod schema before applying it.

## 4. Verification
- **Test**: Create some folders and subscriptions. Export the vault.
- **Test**: Clear the database. Import the vault. 
- **Check**: Verify all metadata is restored, but audio files show as "Missing" (expected).

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
