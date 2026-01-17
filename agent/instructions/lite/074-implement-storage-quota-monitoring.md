> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/database.mdx` before starting.

# Task: Implement Storage Quota Monitoring

## Objective
Provide user visibility into browser storage usage and warn them before reaching the quota limit.

## 1. Monitor Quota
- **Action**: Use `DB.getStorageInfo()` (wraps `navigator.storage.estimate()`).
- **Logic**: Check usage vs. quota on app boot and after large file ingestion.

## 2. Warning UI
- **Target**: `apps/lite/src/routes/settings.tsx`.
- **Implementation**: Display a progress bar showing "Used vs. Total Quota" using localized labels.
- **Alert**: If usage > 80%, show a warning toast: `t('storageQuotaWarning')`.
- **i18n**: Add keys for quota label, usage summary, and warning text.

## 3. Quick Cleanup
- **Action**: Add a "Wipe Cache" button next to the quota bar that clears `audioBlobs` only (keeping metadata).

## 4. Verification
- **Test**: Mock the `storage.estimate()` response to return 90% usage.
- **Check**: Verify the warning appears in the UI and the toast fires.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (Quota section).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
