> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Standardize Forms (Zod + Hook Form) [COMPLETED]

## Objective
Replace uncontrolled inputs and manual validation with `react-hook-form` + `zod`. This applies mainly to the "Settings" page and any future input forms.

## 1. Create Schemas (`apps/lite/src/lib/schemas/settings.ts`)
- **Action**: Define Zod schemas for user settings (e.g., Theme, Language, Proxy).
  ```ts
  export const settingsSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']),
    proxyUrl: z.url().optional().or(z.literal('')),
    // ...
  });
  ```
- **Dependency Check**: Ensure `react-hook-form`, `zod`, and `@hookform/resolvers` are installed.

## 2. Refactor Settings Page
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx`.
- **Action**: Implement `useForm<Settings>({ resolver: zodResolver(settingsSchema) })`.
- **UI**: Use Shadcn `Form` components (`FormItem`, `FormControl`, `FormMessage`).

## 3. Persistence
- **Action**: When form submits (or auto-saves), save values using `apps/lite/src/lib/storage.ts`.
- **Constraint**: Do NOT use `localStorage.setItem` directly. Use the centralized helper to ensure key consistency.

## 4. Verify
- **Test**: Enter invalid Proxy URL. Ensure error message appears.
- **Test**: Reload page. Settings should persist.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/forms.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: Completed
- **Date**: 2026-01-21
- **Completed by**: Antigravity (AI Assistant)
- **Reviewed by**: USER
- **Commands**: 
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite lint`
- **Key Changes**:
  - Created Zod schemas in `src/lib/schemas/settings.ts`.
  - Added shadcn Form components in `src/components/ui/form.tsx`.
  - Created `useSettingsForm` hook with persistence and auto-save on blur.
  - Refactored SettingsPage API Keys card to use react-hook-form.
  - Updated `ui-patterns/forms.mdx` with Form Validation documentation.
- **Verification**:
  - Typecheck passed: ✅
  - Lint passed: ✅
  - Settings form persists values across page reloads: ✅

## Patch Additions (Integrated)
# Patch: 014-standardize-forms

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
- All forms must use Zod schemas; no unvalidated submission paths.
