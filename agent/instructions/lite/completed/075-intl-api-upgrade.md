> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/i18n.mdx` before starting.

# Task: Upgrade Formatters to Intl API [COMPLETED]

## Objective
Replace manual string concatenation for dates and numbers with the native browser `Intl` API for robust, high-performance localization.

## 0. Scope & Phasing
- **Phase A (First)**: Relative time + Date/Time formatters used in high-traffic UI (history, last played, publish date).
- **Phase B (Next)**: Numeric counts (e.g., episodes count, subscriptions, compact numbers like 1.2K).
- **Out of Scope (Keep as-is)**: File size and duration formatters unless inconsistencies are found.

## 1. Refactor `relativeTime.ts`
- **Target**: `apps/lite/src/lib/relativeTime.ts`.
- **Action**: Replace manual string assembly with `Intl.RelativeTimeFormat`.

## 2. Refactor Date/Time formatters
- **Target**: `apps/lite/src/lib/formatters.ts`.
- **Date/Time**: Replace logic with `new Intl.DateTimeFormat()`.
- **Requirement**: Centralize date/time formatters so the app uses one shared formatter per type.

## 3. Refactor Numeric/Count formatters (Phase B)
- **Target**: `apps/lite/src/lib/formatters.ts` (or a dedicated formatter module).
- **Numbers**: Use `new Intl.NumberFormat()` for counts, including compact notation (e.g., 1.2K).
- **Rule**: All counts must use the shared formatter (no ad-hoc formatting).

## 4. Language Awareness
- **Requirement**: Ensure the `Intl` instance always uses the current app language from the `i18n` store.

## 5. Verification
- **Test**: Switch app language to German.
- **Check**: Verify dates use German format (DD.MM.YYYY) and relative times use German words (vor 5 Minuten).

## 6. Tests
- **Target**: `apps/lite/src/lib/__tests__/formatters.test.ts`.
- **Action**: Add coverage for at least `en` + `de` formatting behavior.
- **Must Cover**:
  - Relative time
  - Date/Time formatting
  - Compact number formatting

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/i18n.mdx` (Formatter standards).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- Completed by: Codex
- Commands: `pnpm --filter @readio/lite lint`, `pnpm --filter @readio/lite typecheck`
- Date: 2026-02-05

## Patch Additions (Integrated)
# Patch: 075-intl-api-upgrade

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
- Ensure formatters update on locale change (no stale memo).
