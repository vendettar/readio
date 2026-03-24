# Task: 105 - Expose Integrity Maintenance as a First-Class Settings Capability [COMPLETED]

## Objective
Turn integrity maintenance from implicit background behavior into an explicit, user-triggerable Settings capability with deterministic reporting, while keeping existing cleanup actions unchanged.

## Prerequisite
- `103-modularize-settings-page.md` must be completed first.

## Product Decision (Fixed)
1. Keep background boot maintenance intact in `useAppInitialization`.
2. Upgrade `runIntegrityCheck` to return a typed report object instead of `void`.
3. Add one maintenance hook for UI orchestration: `apps/lite/src/hooks/useIntegrityMaintenance.ts`.
4. Add one dedicated settings section component: `apps/lite/src/components/Settings/sections/MaintenanceSettingsSection.tsx`.
5. Integrate this section into Settings without changing existing wipe/delete flows.
6. Add explicit i18n keys for maintenance UI in all supported locales.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema migration.
- Routing:
  - No route changes.
- Logging:
  - Keep existing integrity log behavior; add no noisy logs.
- Network:
  - No network changes.
- Storage:
  - No new storage key is required for report persistence in this instruction.
- UI state:
  - Add manual scan state (`idle/running/completed`) scoped to settings maintenance hook.
- Tests:
  - Update retention tests and add maintenance section/hook tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Manual scan action must be single-flight; repeated clicks during running state are ignored.
- Hot-path performance:
  - Do not run integrity scan on every render or route change.
- State transition integrity:
  - UI must always leave running state after success and failure.
- Dynamic context consistency:
  - Report labels/timestamps must react to language changes.

## Implementation Steps (Execute in Order)
1. **Define integrity report contract**
   - Update:
     - `apps/lite/src/lib/retention.ts`
   - Add exported type:
     - `IntegrityCheckReport`
   - Required fields:
     - `checkedAt: number`
     - `missingAudioBlob: number`
     - `danglingFolderRef: number`
     - `danglingTrackRef: number`
     - `totalRepairs: number`
   - Required behavior:
     - `runIntegrityCheck(): Promise<IntegrityCheckReport>`
     - always resolve with a report object on normal completion.
     - when internal scan fails, still return a report with zeroed counters and current `checkedAt` after logging error.
     - no rejection-based error flow from `runIntegrityCheck` for expected scan failures (error state is encoded in report counters/logging path).

2. **Add integrity maintenance UI hook**
   - Add:
     - `apps/lite/src/hooks/useIntegrityMaintenance.ts`
   - Required API:
     - `isRunning: boolean`
     - `lastReport: IntegrityCheckReport | null`
     - `runNow: () => Promise<void>`
   - Required behavior:
     - enforce single-flight scan.
     - map report outcome to toasts:
       - repaired items > 0 => success toast
       - repaired items = 0 => informational toast
       - no report-based error toast branch (since `runIntegrityCheck` resolves report on scan failures).
     - optional safeguard:
       - if an unexpected exception occurs outside report contract boundaries, show error toast and reset running state.

3. **Add settings maintenance section component**
   - Add:
     - `apps/lite/src/components/Settings/sections/MaintenanceSettingsSection.tsx`
   - Required UI behavior:
     - render "Scan & Repair" action button.
     - show running state while scan executes.
     - render last report timestamp and counters after completion.
     - keep layout consistent with existing Settings section style.

4. **Integrate maintenance section in Settings composition**
   - Update:
     - `apps/lite/src/routeComponents/SettingsPage.tsx`
   - Required behavior:
     - wire section to `useIntegrityMaintenance`.
     - keep existing `StorageSettingsSection` wipe/delete logic unchanged.
     - keep existing diagnostics log-download section unchanged.

5. **Add i18n keys in all locales**
   - Update:
     - If Task 100 is not completed: `apps/lite/src/lib/translations.ts`
     - If Task 100 is completed: `apps/lite/src/lib/locales/en.ts`, `zh.ts`, `ja.ts`, `ko.ts`, `de.ts`, `es.ts`
   - Required keys (all locales/resources):
     - `settings.maintenanceTitle`
     - `settings.maintenanceDesc`
     - `settings.maintenanceRunNow`
     - `settings.maintenanceRunning`
     - `settings.maintenanceLastChecked`
     - `settings.maintenanceRepairs`
     - `toastMaintenanceNoIssues`
     - `toastMaintenanceRepaired`
   - Optional key:
     - `toastMaintenanceFailed` (only if hook keeps optional unexpected-exception safeguard path).

6. **Docs sync (atomic)**
   - Update architecture/features docs to state that integrity maintenance has both boot-time automatic execution and manual Settings trigger.

## Acceptance Criteria
- Manual "Scan & Repair" is available in Settings and works reliably.
- Scan button is disabled during running state.
- Scan result report is visible after completion.
- Existing wipe cache, wipe all, delete session, and clear cache flows remain unchanged.
- Background maintenance at app boot remains active.

## Required Tests
1. Update:
   - `apps/lite/src/lib/retention.test.ts`
   - Assert `runIntegrityCheck` returns report object with expected counters.
2. Update:
   - `apps/lite/src/lib/__tests__/retention.test.ts`
   - Keep prune policy tests green after retention module API changes.
3. Add:
   - `apps/lite/src/hooks/__tests__/useIntegrityMaintenance.test.ts`
   - Assert single-flight behavior, state transitions, and toast dispatch by outcome.
4. Add:
   - `apps/lite/src/components/Settings/__tests__/MaintenanceSettingsSection.test.tsx`
   - Assert running/idle states and report rendering.
5. Update:
   - `apps/lite/src/routeComponents/__tests__/SettingsPage.test.tsx`
   - Assert maintenance section integration does not break existing settings assertions.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/retention.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/retention.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useIntegrityMaintenance.test.ts`
- `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/MaintenanceSettingsSection.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/SettingsPage.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/retention.ts`
  - `apps/lite/src/hooks/useIntegrityMaintenance.ts` (new)
  - `apps/lite/src/components/Settings/sections/MaintenanceSettingsSection.tsx` (new)
  - `apps/lite/src/routeComponents/SettingsPage.tsx`
  - `apps/lite/src/lib/translations.ts`
  - tests:
    - `apps/lite/src/lib/retention.test.ts`
    - `apps/lite/src/lib/__tests__/retention.test.ts`
    - `apps/lite/src/hooks/__tests__/useIntegrityMaintenance.test.ts` (new)
    - `apps/lite/src/components/Settings/__tests__/MaintenanceSettingsSection.test.tsx` (new)
    - `apps/lite/src/routeComponents/__tests__/SettingsPage.test.tsx`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- Regression risks:
  - unhandled running-state lock when scan fails
  - report field mismatch between hook and UI
  - i18n key omissions causing `i18n:check` failures
- Required verification:
  - maintenance tests pass
  - retention tests pass
  - settings route tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new background schedulers.
- Do not add new persistence tables for maintenance status.
- Do not change retention pruning policy in this instruction.

## Required Patterns
- Integrity scan result is typed and explicit.
- Manual maintenance is opt-in and user-triggered.
- Existing destructive storage flows remain isolated in storage-maintenance logic.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/hooks/__tests__/useIntegrityMaintenance.test.ts`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
