> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Standardize I18n Framework

## Objective
Migrate all hardcoded strings and legacy `useI18n` usages to the new `react-i18next` framework established in **Instruction #011**.

## 1. Audit Components
- **Scan**: Search for strings in `apps/lite/src/components/*` and `routes/*`.
- **Action**: Move hardcoded strings to `apps/lite/src/lib/translations.ts`.
- **Replace**: Use `const { t } = useI18n()` (which now wraps i18next).

## 2. Refactor Legacy JSON
- **Action**: If `apps/lite/src/locales/en.json` still exists, migrate its keys to `translations.ts` and delete the JSON file.
- **Goal**: Zero external JSON files for translation. All in TypeScript.

## 3. Verify
- **Test**: Switch language. All UI text should update.
- **Check**: No `[MISSING: key]` text should appear.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.