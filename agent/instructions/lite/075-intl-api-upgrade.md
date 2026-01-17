> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/i18n.mdx` before starting.

# Task: Upgrade Formatters to Intl API

## Objective
Replace manual string concatenation for dates and numbers with the native browser `Intl` API for robust, high-performance localization.

## 1. Refactor `formatters.ts`
- **Target**: `apps/lite/src/lib/formatters.ts`.
- **Date/Time**: Replace logic with `new Intl.DateTimeFormat()`.
- **Relative Time**: Use `new Intl.RelativeTimeFormat()` for "X ago" strings.
- **Numbers**: Use `new Intl.NumberFormat()` for file sizes and large counts.

## 2. Refactor `relativeTime.ts`
- **Target**: `apps/lite/src/lib/relativeTime.ts`.
- **Action**: Replace manual string assembly with `Intl.RelativeTimeFormat`.

## 3. Language Awareness
- **Requirement**: Ensure the `Intl` instance always uses the current app language from the `i18n` store.

## 4. Verification
- **Test**: Switch app language to German.
- **Check**: Verify dates use German format (DD.MM.YYYY) and relative times use German words (vor 5 Minuten).

## 5. Tests
- **Target**: `apps/lite/src/lib/__tests__/formatters.test.ts`.
- **Action**: Add coverage for at least `en` + `de` formatting behavior.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/i18n.mdx` (Formatter standards).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
