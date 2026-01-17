> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Standardize I18n Framework

## Objective
Migrate all hardcoded strings and legacy `useI18n` usages to **direct** `react-i18next` usage established in **Instruction #011**.

## 1. Audit Components
- **Scan**: Search for strings in `apps/lite/src/components/*` and `routes/*`.
- **Action**: Move hardcoded strings to `apps/lite/src/lib/translations.ts`.
- **Replace**: Use `const { t } = useTranslation()` from `react-i18next`.

## 2. Refactor Legacy JSON and Utilities
- **Action**: If `apps/lite/src/locales/en.json` still exists, migrate its keys to `translations.ts` and delete the JSON file.
- **Goal**: Zero external JSON files for translation. All in TypeScript.
- **Check**: Update any custom translation helpers to call `i18next.t` (not legacy translation maps).
 - **Type Rule**: Do NOT cast keys to `string` or `any`. Fix missing keys at the source.

## 3. Remove Legacy Hook Usage
- **Check**: `rg "useI18n" apps/lite/src` returns zero results.
- **Check**: `rg "I18nProvider" apps/lite/src` returns zero results.

## 4. Verify
- **Test**: Switch language. All UI text should update.
- **Check**: No `[MISSING: key]` text should appear.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/i18n.mdx`.
- Update `apps/docs/content/docs/apps/lite/i18n-guide.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
