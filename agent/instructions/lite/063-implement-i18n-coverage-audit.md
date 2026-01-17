> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/i18n.mdx` before starting.

# Task: Implement I18n Coverage Audit

## Objective
Prevent UI regressions caused by missing translation keys in non-English languages.

## 1. Create Audit Script
- **Action**: Create `apps/lite/scripts/audit-i18n.ts`.
- **Logic**:
  - Load `translations.ts`.
  - Deep-compare the keys of the `en` object against `zh`, `ja`, etc.
  - Identify missing or extra keys in secondary languages.

## 2. Build-Time Enforcement
- **Action**: Add an `"i18n:check": "tsx scripts/audit-i18n.ts"` script to `package.json`.
- **Requirement**: Integrate this check into the CI pipeline (Instruction 044). If keys are mismatched, the build MUST fail.
 - **Dependency**: Ensure `tsx` is available (add dev dependency if missing).

## 3. Verification
- **Test**: Deliberately remove a key from the `zh` translation. Run the script.
- **Check**: Verify the build fails with a list of missing keys.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/i18n.mdx` (Maintenance section).
- Update `apps/docs/content/docs/apps/lite/i18n-guide.mdx` (Coverage audit).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D026 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
