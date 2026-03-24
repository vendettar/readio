> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/database.mdx` before starting.

# Task: Implement Storage Quota Monitoring [COMPLETED]

## Objective
Provide user visibility into browser storage usage and warn them before reaching the quota limit.

## 1. Monitor Quota
- **Action**: Use `DB.getStorageInfo()` (wraps `navigator.storage.estimate()`).
- **Logic**:
  - Check usage vs. quota on app boot.
  - Re-check after each local file import completes (no size threshold).
- **Persist**:
  - Request persistence once on app boot via `navigator.storage.persist()`.
  - If persistence is denied or fails, optionally re-request before local file upload (one prompt per session).
- **Fallback**: If `navigator.storage` or `estimate()` is unavailable, mark quota as unavailable and skip the progress UI.
- **Config**:
  - Add `MAX_AUDIO_CACHE_GB` to runtime config (default `10`).
  - Map to `READIO_MAX_AUDIO_CACHE_GB` in `public/env.js` for self-host overrides.

## 2. Warning UI
- **Target**: `apps/lite/src/routes/settings.tsx`.
- **Implementation**: Display a progress bar showing "Used vs. Total Quota" using localized labels.
- **Alert**: If usage > 80%, show a warning toast: `t('storageQuotaWarning')`.
- **Rate Limit**: Warn at most once per session (or only on first crossing above 80%).
- **Unavailable State**: If quota is unavailable, show `t('storageQuotaUnavailable')`, hide the bar, and disable wipe.
- **i18n**: Add keys for quota label, usage summary, and warning text.
  - **Required keys**:
    - `storageQuotaTitle`
    - `storageQuotaUsed`
    - `storageQuotaTotal`
    - `storageQuotaWarning`
    - `storageQuotaUnavailable`
    - `storageQuotaWipe`
    - `storageQuotaWipeBlocked`
    - `storageQuotaUploadBlocked`
    - `storageQuotaUploadRisk`
    - `storageQuotaPersistRequest`
    - `storageQuotaPersistDenied`

## 3. Quick Cleanup
- **Action**: Add a "Wipe Cache" button next to the quota bar that clears `audioBlobs` only (keeping metadata).
- **Safety**: If local audio is currently playing, block wipe and show `t('storageQuotaWipeBlocked')`. Otherwise, perform the wipe and refresh quota.

## 4. Upload Guardrail
- **Hard Cap (Audio Only)**: Enforce a maximum audio cache size of `MAX_AUDIO_CACHE_GB` (default 10GB) based on `indexedDB.audioBlobsSize`.
- **Block**: Prevent local file upload if any condition is met:
  - `indexedDB.audioBlobsSize >= maxAudioCacheBytes`, OR
  - `indexedDB.audioBlobsSize + fileSize > maxAudioCacheBytes`, OR
  - `usage / quota >= 0.85`, OR
  - `usage + fileSize > quota * 0.95`
- **If quota is unavailable**: Still enforce the audio cache cap; otherwise allow upload but show `t('storageQuotaUploadRisk')` before proceeding.
- **When blocked**: Show `t('storageQuotaUploadBlocked')` and provide a path to clear cache.

## 5. Verification
- **Test**: Mock the `storage.estimate()` response to return 90% usage.
- **Check**: Verify the warning appears in the UI and the toast fires.
- **Fallback Test**: Mock `navigator.storage` as unavailable and verify the UI shows the unavailable state and disables wipe.
- **Wipe Block Test**: When local audio is playing, clicking “Wipe Cache” is blocked and shows `t('storageQuotaWipeBlocked')`.
- **Upload Block Test**: Mock usage/quota to trigger the guardrail and verify upload is blocked with `t('storageQuotaUploadBlocked')`.
- **Upload Risk Test**: Mock `navigator.storage` as unavailable and verify upload is allowed with `t('storageQuotaUploadRisk')`.
- **Audio Cap Test**: Mock `indexedDB.audioBlobsSize` near the cap and verify upload blocks when exceeding `MAX_AUDIO_CACHE_GB`.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (Quota section).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- Completed by: Codex
- Commands: `pnpm test:run apps/lite/src/lib/__tests__/storageQuota.test.ts apps/lite/src/hooks/__tests__/useAppInitialization.test.ts`, `pnpm lint`, `pnpm typecheck`
- Date: 2026-02-05

## Patch Additions (Integrated)
# Patch: 074-implement-storage-quota-monitoring

## Why
Content-level normalization to align with Leadership requirements and prevent execution drift.

## Global Additions
- Add Scope Scan (config, persistence, routing, logging, network, storage, UI state, tests).
- Add Hidden Risk Sweep for async control flow and hot-path performance.
- Add State Transition Integrity check.
- Add Dynamic Context Consistency check for locale/theme/timezone/permissions.
- Add Impact Checklist: affected modules, regression risks, required verification.
- Add Forbidden Dependencies / Required Patterns when touching architecture or cross-module refactors.

## Task-Specific Additions
- Align persistence request policy between boot and upload flows.
