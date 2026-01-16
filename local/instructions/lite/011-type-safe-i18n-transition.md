> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Type-Safe I18n Transition (Standard)

## Objective
Transition from the legacy `useI18n` hook to a standard `react-i18next` implementation, while strictly adhering to the project's TypeScript-first translation strategy (no JSON files).

## 1. Create Translation Source (`apps/lite/src/lib/translations.ts`)
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

## 2. Initialize `i18next` (`apps/lite/src/lib/i18n.ts`)
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

## 3. Refactor `useI18n` Hook (Adapter)
- **Target**: `apps/lite/src/hooks/useI18n.ts`.
- **Action**: Rewrite it to wrap `useTranslation()`.
- **Return**: Expose `t` which accepts `TranslationKey`.
  ```ts
  export function useI18n() {
    const { t } = useTranslation();
    return { t }; // Ensure strict typing matches TranslationKey
  }
  ```

## 4. Verification
- **Test**: Change language in browser settings (or mock it). Ensure app updates.
- **Test**: Use a non-existent key in code. TypeScript should error.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
