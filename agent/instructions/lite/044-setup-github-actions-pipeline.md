> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Setup CI Pipeline (GitHub Actions)

## Objective
Add a CI pipeline that runs lint, typecheck, and tests on every PR and push to main.

## 1. Workflow File
- **Path**: `.github/workflows/ci.yml`.
- **Triggers**: `push` and `pull_request`.
- **Jobs**:
  - Install (pnpm)
  - `pnpm --filter @readio/lite lint`
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite test:run`
  - `pnpm --filter @readio/lite test:e2e`

## 2. Caching
- **Action**: Enable pnpm cache and Playwright browsers cache.

## 3. Verification
- **Test**: Open a PR; CI must run and fail on lint/test errors.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck` locally before pushing.
- **Lint**: Run `pnpm --filter @readio/lite lint` locally before pushing.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (CI policy).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D011 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
