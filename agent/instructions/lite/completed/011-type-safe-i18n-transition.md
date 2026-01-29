> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Type-Safe I18n Transition (Standard) [COMPLETED]

## Objective
Transition from the legacy `useI18n` hook to **direct** `react-i18next` usage (`useTranslation`), while strictly adhering to the project's TypeScript-first translation strategy (no JSON files).

## 1. Add Dependencies
- **Install**: `react-i18next`, `i18next`, `i18next-browser-languagedetector`.
- **Remove**: Any legacy i18n dependencies that conflict or duplicate behavior.

## 2. Create Translation Source (`apps/lite/src/lib/translations.ts`)
- **Action**: Create this file if it doesn't exist.
- **Content**: Export a constant object `translations` with `en` as the default key.
  ```ts
  export const translations = {
    en: {
      // Migrate keys from existing en.json or dateUtils
      welcome: "Welcome",
      // ...
    },
    zh: { ... }
  } as const;
  
  export type TranslationKey = keyof typeof translations.en;
  ```

## 3. Initialize `i18next` (`apps/lite/src/lib/i18n.ts`)
- **Action**: Configure `i18next`.
- **Plugins**: Use `initReactI18next` and `LanguageDetector`.
- **Resources**: Import `translations` from `./translations.ts`. Do NOT load from `/public/locales`.
- **Config**:
  ```ts
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { 
        en: { translation: translations.en },
        zh: { translation: translations.zh }
      },
      fallbackLng: 'en',
      interpolation: { escapeValue: false }
    });
  ```

## 4. Replace Provider and Legacy Hook
- **Remove Provider**: Delete `I18nProvider` usage from `apps/lite/src/main.tsx` and remove the provider component if it exists.
- **Remove Hook**: Delete `apps/lite/src/hooks/useI18n.ts` and update all call sites to use `useTranslation()` directly.
- **Replace Imports**: `import { useI18n } from '@/hooks/useI18n'` -> `import { useTranslation } from 'react-i18next'`.

## 5. Type Safety
- **Requirement**: Use **i18next module augmentation** to type `t()` so it only accepts valid keys.
- **Rule**: Do NOT use `as TranslationKey`, `as any`, or `string` casts to bypass typing.
- **Scope**: `TranslationKey` type remains the single source of truth in `src/lib/translations.ts`.

## 6. Non-React Usage
- **Rule**: Non-React code must use `i18next.t` or a helper that calls `i18next.t` (not the old `translate()` implementation).
- **Action**: Update `apps/lite/src/lib/i18nUtils.ts` to read from `i18next` and keep the same `translate(key, options)` API.

## 7. Verification
- **Test**: Change language in browser settings (or mock it). Ensure app updates.
- **Test**: Use a non-existent key in code. TypeScript should error.
 - **Check**: `rg "useI18n" apps/lite/src` returns zero results.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/i18n.mdx`.
- Update `apps/docs/content/docs/apps/lite/i18n-guide.mdx`.
## Completion
- **Status**: Completed 2026-01-21
- **Key Changes**:
  - Migrated from custom `useI18n` to `react-i18next`.
  - Implemented strictly typed `t()` function via module augmentation.
  - Consolidated all configuration in `src/lib/i18n.ts`.
  - Hardened i18n config with `supportedLngs` and `load: 'languageOnly'`.
  - Added Dev-only warnings for missing keys in `translate()` utility.
  - Normalized locale handling in `SettingsPage.tsx`.
  - Removed dead `READIO_DEFAULT_LANG` configuration from `runtimeConfig.ts` and `public/env.js`.
- **Verification**:
  - `pnpm --filter @readio/lite build` (tsc) passed: ✅
  - `pnpm --filter @readio/lite lint` passed: ✅
  - `rg "useI18n" apps/lite/src` returns 0 results: ✅
  - Locale normalization tested (e.g., `en-US` correctly maps to `en`): ✅
  - Missing key warning in dev environment verified: ✅
- **Bilingual Documentation**:
  - `apps/docs/content/docs/apps/lite/handoff/i18n.mdx` & `.zh.mdx`: Updated ✅
  - `apps/docs/content/docs/apps/lite/i18n-guide.mdx` & `.zh.mdx`: Updated ✅
  - `apps/docs/content/docs/apps/lite/handoff/index.mdx` & `.zh.mdx`: Status updated ✅
