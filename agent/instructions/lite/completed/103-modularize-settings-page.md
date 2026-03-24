# Task: 103 - Modularize Settings Page into Stable Section Components [COMPLETED]

## Objective
Refactor `SettingsPage` from a monolithic route component into section-based modules with explicit prop boundaries, while preserving current behavior and UX.

## Product Decision (Fixed)
1. Add one shared section wrapper: `apps/lite/src/components/Settings/SettingsSectionCard.tsx`.
2. Add dedicated section components under `apps/lite/src/components/Settings/sections/`:
   - `AppearanceSettingsSection.tsx`
   - `GeneralSettingsSection.tsx`
   - `MigrationSettingsSection.tsx`
   - `VaultSettingsSection.tsx`
   - `ApiKeysSettingsSection.tsx`
   - `DiagnosticsSettingsSection.tsx`
   - `LegalSettingsSection.tsx`
   - `StorageSettingsSection.tsx`
3. Keep `apps/lite/src/routeComponents/SettingsPage.tsx` as orchestration authority:
   - hook wiring
   - confirm dialog state
   - destructive action handlers
   - cross-section callback wiring.
4. Keep existing hooks unchanged in responsibility:
   - `useSettingsData`
   - `useSettingsForm`
   - `useStorageMaintenance`
   - `useConfirmDialog`
5. Keep current settings UX, copy, and interaction behavior unchanged.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema or settings key changes.
- Routing:
  - No route changes.
- Logging:
  - Keep existing settings/logging behavior unchanged.
- Network:
  - No network contract changes.
- Storage:
  - Keep existing storage wipe/session deletion semantics unchanged.
- UI state:
  - Structural extraction only; no UX redesign.
- Tests:
  - Update route tests and add section-level tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Form blur auto-save and import/export async flows must keep current ordering.
- Hot-path performance:
  - Avoid prop drilling of entire store objects; pass minimal scalar props and callbacks.
- State transition integrity:
  - Confirm dialog destructive flows must remain centralized and deterministic.
- Dynamic context consistency:
  - language/content-region selectors must continue to reflect live i18n/store updates.

## Implementation Steps (Execute in Order)
1. **Create shared settings section wrapper**
   - Add:
     - `apps/lite/src/components/Settings/SettingsSectionCard.tsx`
   - Required behavior:
     - Wraps existing `Card` structure with standardized header/title/description/body slots.
     - Does not introduce new styling tokens.

2. **Extract appearance and general sections**
   - Add:
     - `apps/lite/src/components/Settings/sections/AppearanceSettingsSection.tsx`
     - `apps/lite/src/components/Settings/sections/GeneralSettingsSection.tsx`
   - Required behavior:
     - Accent color selection behavior unchanged.
     - Interface language selection behavior unchanged.
     - Content region selection behavior unchanged.
     - Auto-scroll checkbox rendering preserved.

3. **Extract migration and vault sections**
   - Add:
     - `apps/lite/src/components/Settings/sections/MigrationSettingsSection.tsx`
     - `apps/lite/src/components/Settings/sections/VaultSettingsSection.tsx`
   - Required behavior:
     - Keep existing import/export callbacks and hidden input flow unchanged.
     - Keep existing destructive import-vault confirmation flow unchanged.

4. **Extract API keys and diagnostics sections**
   - Add:
     - `apps/lite/src/components/Settings/sections/ApiKeysSettingsSection.tsx`
     - `apps/lite/src/components/Settings/sections/DiagnosticsSettingsSection.tsx`
   - Required behavior:
     - Keep form validation + blur-save semantics unchanged.
     - Keep download logs button behavior unchanged.

5. **Extract legal and storage sections**
   - Add:
     - `apps/lite/src/components/Settings/sections/LegalSettingsSection.tsx`
     - `apps/lite/src/components/Settings/sections/StorageSettingsSection.tsx`
   - Required behavior:
     - Keep storage quota display, wipe-cache guard, and history session actions unchanged.
     - Keep wipe-all behavior and disable conditions unchanged.

6. **Refactor SettingsPage to compose sections**
   - Update:
     - `apps/lite/src/routeComponents/SettingsPage.tsx`
   - Required behavior:
     - Keep only orchestration logic and section composition.
     - Keep `ConfirmAlertDialog` at route level.
     - Remove inline card JSX replaced by section components.

7. **Docs sync (atomic)**
   - Update docs to reflect sectioned Settings architecture and route orchestration responsibility.

## Acceptance Criteria
- Settings page visual output and behavior remain unchanged.
- All existing destructive flows still require explicit confirmation.
- Language/content-region changes still apply immediately.
- Storage actions (wipe cache / wipe all / delete session / clear session cache) behave exactly as before.
- `SettingsPage.tsx` becomes orchestration-only and significantly smaller.

## Required Tests
1. Update:
   - `apps/lite/src/routeComponents/__tests__/SettingsPage.test.tsx`
   - Keep all existing assertions; no assertion removal.
   - Require full previous coverage parity (no feature-area assertion gaps after section extraction).
2. Add:
   - `apps/lite/src/components/Settings/__tests__/GeneralSettingsSection.test.tsx`
   - Assert language and content-region controls call provided callbacks with selected value.
3. Add:
   - `apps/lite/src/components/Settings/__tests__/StorageSettingsSection.test.tsx`
   - Assert wipe-cache disabled/enabled rendering and session action callback wiring.
4. Add:
   - `apps/lite/src/components/Settings/__tests__/ApiKeysSettingsSection.test.tsx`
   - Assert blur triggers save callback path and field rendering parity.
5. Add:
   - `apps/lite/src/components/Settings/__tests__/MigrationSettingsSection.test.tsx`
   - `apps/lite/src/components/Settings/__tests__/VaultSettingsSection.test.tsx`
   - Assert import/export callbacks and confirmation-trigger callback wiring remain intact.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/SettingsPage.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/GeneralSettingsSection.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/StorageSettingsSection.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/ApiKeysSettingsSection.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/MigrationSettingsSection.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/VaultSettingsSection.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/Settings/SettingsSectionCard.tsx` (new)
  - `apps/lite/src/components/Settings/sections/AppearanceSettingsSection.tsx` (new)
  - `apps/lite/src/components/Settings/sections/GeneralSettingsSection.tsx` (new)
  - `apps/lite/src/components/Settings/sections/MigrationSettingsSection.tsx` (new)
  - `apps/lite/src/components/Settings/sections/VaultSettingsSection.tsx` (new)
  - `apps/lite/src/components/Settings/sections/ApiKeysSettingsSection.tsx` (new)
  - `apps/lite/src/components/Settings/sections/DiagnosticsSettingsSection.tsx` (new)
  - `apps/lite/src/components/Settings/sections/LegalSettingsSection.tsx` (new)
  - `apps/lite/src/components/Settings/sections/StorageSettingsSection.tsx` (new)
  - `apps/lite/src/routeComponents/SettingsPage.tsx`
  - tests under:
    - `apps/lite/src/routeComponents/__tests__/`
    - `apps/lite/src/components/Settings/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
- Regression risks:
  - prop wiring omissions during extraction
  - confirm-dialog callback mismatches
  - settings form blur-save behavior drift
- Required verification:
  - settings route tests pass
  - new section tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new form/state libraries.
- Do not redesign Settings UI layout.
- Do not change translation key names.

## Required Patterns
- Route component owns orchestration, sections own rendering.
- Section props are explicit and minimal.
- Keep existing shadcn/radix primitives and Tailwind tokens.

## Decision Log
- Required: No (behavior-preserving modular refactor).

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec vitest run src/routeComponents/__tests__/SettingsPage.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Settings/__tests__/GeneralSettingsSection.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Settings/__tests__/StorageSettingsSection.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Settings/__tests__/ApiKeysSettingsSection.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Settings/__tests__/MigrationSettingsSection.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Settings/__tests__/VaultSettingsSection.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
