> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Manage PWA Update Lifecycle [COMPLETED]

## Objective
Ensure users are notified when a new PWA version is available and can refresh to update.

## 1. PWA Update Hook
- **Action**: Use the `useRegisterSW` hook from `virtual:pwa-register/react`.
- **Implementation**:
  ```ts
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  ```
- **Behavior**:
  - `needRefresh` triggers the user notification.
  - `updateServiceWorker(true)` implements the `refreshApp()` action.

## 2. User Notification
- **Action**: Show a toast when a new version is available.
- **Message**: `t('pwa.updateAvailable')` with action button `t('pwa.refreshNow')`.
- **Rule**: Use `toast.*Key` and keep translation in `src/lib/toast.ts`.

## 3. Verification
- **Test**: Simulate SW update in dev; verify toast appears and refresh works.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (PWA update behavior).
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx` (toast usage for update).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D010 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: 100% Completed
- **Reviewed by**: Antigravity
- **Date**: 2026-01-29
