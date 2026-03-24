# [COMPLETED] Instruction 127f: ASR Settings Snapshot SSOT

## Status
- [x] Active
- [x] Completed

## Goal
Extract a single source of truth for ASR settings snapshot and default mapping to eliminate drift between the settings form, runtime ASR blocks, and SSR fallbacks.

## Scope
- `apps/lite/src/lib/schemas/settings.ts` (Refactor: add `getSettingsSnapshot()`)
- `apps/lite/src/hooks/useSettingsForm.ts` (Refactor: use `getSettingsSnapshot`)
- `apps/lite/src/lib/remoteTranscript.ts` (Refactor: use `getSettingsSnapshot`)
- `apps/lite/src/lib/__tests__/settings.snapshot.test.ts` (New: Add contract tests covering empty storage, partial storage, and runtime config fallback)

## Requirements
1. Create `getSettingsSnapshot()` in `apps/lite/src/lib/schemas/settings.ts`. This function should wrap `getJson(SETTINGS_STORAGE_KEY)` and consistently fill in runtime config defaults for missing values (e.g. `ASR_PROVIDER`, `ASR_MODEL`).
2. Replace duplication in `useSettingsForm.ts:mapSettingsStorageToPreferences` and `remoteTranscript.ts:getAsrSettingsSnapshot`.
3. Remove deprecated `useAsrEnabled` and keep runtime gating on provider/model/key readiness.
4. Add a test suite covering settings hydration logic (empty DB uses config, partial DB overrides config).

## Verification
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run src/lib/__tests__/settings.snapshot.test.ts`
- `pnpm -C apps/lite build`

## Completion
- Completed by: Antigravity (Agent)
- Commands: `pnpm -C apps/lite lint && pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit && pnpm -C apps/lite test:run src/lib/__tests__/settings.snapshot.test.ts`
- Date: 2026-02-27
- Reviewed by: Completed
