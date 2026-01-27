> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/security.mdx` before starting.

# Task: Enforce Dependency Audit & License Policy

## Objective
Secure the supply chain by ensuring all dependencies are safe and follow the project's open-source licensing policy.

## 1. Setup `pnpm audit`
- **Action**: Integrate `pnpm audit` into the CI pipeline.
- **Rule**: Build must fail on high/critical vulnerabilities (`--audit-level high`).

## 2. License Checker
- **Action**: Install `license-checker` or a similar tool.
- **Default**: Use `license-checker` for this task.
- **Policy**: Allow permissive licenses only (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC).
- **Block**: Fail the build if any GPL/LGPL/AGPL, unknown, or unlicensed dependencies appear.

## 3. Verification
- **Test**: Add a dummy library with a GPL license.
- **Check**: Verify the CI fails with a license violation error.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/security.mdx` (Supply chain section).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
