# Task: 100 - Modularize i18n Resources with Typed Lazy Loading [COMPLETED]

## Objective
Split monolithic translations into per-language modules and load non-default locales on demand, while preserving i18n behavior and key-level type safety.

## Product Decision (Fixed)
1. Use per-language **TypeScript locale modules** under `apps/lite/src/lib/locales/`.
2. Do not use `i18next-http-backend` and do not introduce new i18n dependencies.
3. Keep `apps/lite/src/lib/translations.ts` as the i18n contract hub (language type, native names, schema type, loader registry), not as a monolithic dictionary file.
4. Keep English (`en`) as the base schema source of truth for typing.
5. Implement runtime lazy loading via `import()` for non-preloaded locales.
6. Keep startup behavior deterministic:
   - language source priority remains `localStorage -> runtime default -> en`
   - no navigator-language fallback.
7. Add a safe language-switch API in i18n layer and migrate Settings language switch to use it.
8. Update i18n audit script to validate parity across modular locale files.

## Scope Scan (Required)
- Config:
  - No runtime env variable changes.
- Persistence:
  - No DB/schema changes.
- Routing:
  - No route changes.
- Logging:
  - No logging policy changes.
- Network:
  - No runtime network locale fetch strategy.
- Storage:
  - Keep existing language localStorage key contract unchanged.
- UI state:
  - No UX redesign; language switching behavior preserved.
- Tests:
  - Add loader/type/audit coverage tests and keep app integration behavior stable.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Prevent race where quick language toggles load stale locale and overwrite newer selection.
  - Add per-language in-flight promise dedupe in loader.
  - Enforce latest-wins semantics for rapid language toggles (older async resolution must not override newer selection).
- Hot-path performance:
  - Ensure only minimal locale resources are in initial bundle.
- State transition integrity:
  - Language switching must not enter a “key string shown” state after successful locale load.
- Dynamic context consistency:
  - Maintain `<html lang>` synchronization after async locale load and language change.

## Implementation Steps (Execute in Order)
1. **Create modular locale files**
   - Add directory:
     - `apps/lite/src/lib/locales/`
   - Add files:
     - `en.ts`, `zh.ts`, `ja.ts`, `ko.ts`, `de.ts`, `es.ts`
   - Each file exports exactly one `const` locale object (default export), with key set matching `en` schema.

2. **Refactor translation contract hub**
   - Update:
     - `apps/lite/src/lib/translations.ts`
   - Required exports:
     - `type Language`
     - `languageNativeNames`
     - `type TranslationSchema` (derived from `en` locale)
     - `localeLoaders: Record<Language, () => Promise<TranslationSchema>>`
     - `baseEnglishTranslations` (eager import from `locales/en.ts`)
   - Remove monolithic in-file translation object.

3. **Implement lazy locale loading in i18n bootstrap**
   - Update:
     - `apps/lite/src/lib/i18n.ts`
   - Required behavior:
     - initialize i18next with English resource only
     - expose `ensureLocaleLoaded(lang)` with in-flight dedupe
     - expose `changeLanguageSafely(lang)` that awaits `ensureLocaleLoaded` then calls `i18n.changeLanguage(lang)`
     - `changeLanguageSafely` must implement latest-wins guard (request token/version gate) to prevent stale apply on rapid toggles
     - `ensureLocaleLoaded` must clear in-flight entry on both success and failure (`finally`) so failed loads do not poison future retries
     - preserve existing `<html lang>` sync logic
     - preserve existing detection order and fallback settings.

4. **Migrate language switch entry point**
   - Update:
     - `apps/lite/src/routeComponents/SettingsPage.tsx`
   - Replace direct `i18n.changeLanguage(...)` call with `changeLanguageSafely(...)`.

5. **Refactor i18n audit script for modular locales**
   - Update:
     - `apps/lite/scripts/audit-i18n.ts`
   - Required behavior:
     - load locale modules via the shared loader registry
     - compare full key parity against English schema
     - fail on missing or extra keys.

6. **Type-safety continuity**
   - Keep i18next module augmentation based on English schema so `t()` key autocomplete remains intact.
   - Keep `TranslationKey` usage compatibility in existing schema/toast/store code.

7. **Docs sync (atomic)**
   - Update i18n and architecture docs to reflect modular locale layout and lazy-load behavior.

## Acceptance Criteria
- Non-English locales are loaded on demand via module dynamic import.
- App language switching remains functional and deterministic.
- Rapid language toggles apply latest selection only (no stale language overwrite).
- i18n key typing for `t()` and `TranslationKey` remains strict.
- `pnpm --filter @readio/lite i18n:check` passes on modular locale structure.
- Initial bundle no longer embeds all locale dictionaries from the old monolith.
- Build output verification shows non-`en` locale resources split into async chunks (or equivalent lazy-loaded modules), and main entry no longer contains full non-`en` dictionaries.

## Required Tests
1. Add:
   - `apps/lite/src/lib/__tests__/i18nLocaleLoader.test.ts`
   - Verify loader returns expected resource shape and in-flight dedupe behavior.
2. Add:
   - `apps/lite/src/lib/__tests__/i18nChangeLanguageSafely.test.ts`
   - Verify safe switch waits for locale load and updates language correctly.
   - Verify latest-wins behavior under rapid consecutive language changes.
   - Verify failed locale load does not block subsequent retry for the same language.
3. Update or add script-level coverage:
   - `apps/lite/scripts/audit-i18n.ts` behavior validated by `pnpm -C apps/lite i18n:check`.
4. Keep existing i18n-dependent tests green (Settings and search/UI smoke tests impacted by language labels).

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite i18n:check`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/i18nLocaleLoader.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/i18nChangeLanguageSafely.test.ts`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite check-size`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/locales/en.ts` (new)
  - `apps/lite/src/lib/locales/zh.ts` (new)
  - `apps/lite/src/lib/locales/ja.ts` (new)
  - `apps/lite/src/lib/locales/ko.ts` (new)
  - `apps/lite/src/lib/locales/de.ts` (new)
  - `apps/lite/src/lib/locales/es.ts` (new)
  - `apps/lite/src/lib/translations.ts`
  - `apps/lite/src/lib/i18n.ts`
  - `apps/lite/src/routeComponents/SettingsPage.tsx`
  - `apps/lite/scripts/audit-i18n.ts`
  - tests under `apps/lite/src/lib/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/i18n.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/i18n.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- Regression risks:
  - async language-switch race conditions
  - temporary fallback text flashes on first non-en switch
  - typing regression in `TranslationKey` consumers
- Required verification:
  - i18n checks pass
  - language switch works in Settings
  - build and size checks pass

## Forbidden Dependencies
- Do not add new i18n backend/plugin dependencies.
- Do not convert locale files to runtime network fetch JSON in this instruction.
- Do not change language storage key names.

## Required Patterns
- Schema source of truth from English locale module.
- Dynamic locale loading through shared loader registry.
- Explicit safe language-switch API (`changeLanguageSafely`).

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
  - `pnpm -C apps/lite i18n:check`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/i18nLocaleLoader.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/i18nChangeLanguageSafely.test.ts`
  - `pnpm -C apps/lite test:run`
  - `pnpm -C apps/lite check-size`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
