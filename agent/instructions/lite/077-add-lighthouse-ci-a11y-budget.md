> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` and `agent/instructions/lite/044-setup-github-actions-pipeline.md` before starting.

# Task: Add Lighthouse CI Budget

## Objective
Enforce performance and accessibility standards automatically in the CI pipeline to prevent quality regression.

## 1. Setup Lighthouse CI
- **Action**: Install `@lhci/cli` in the monorepo.
- **Config**: Add `.lighthouserc.json` to `apps/lite`.

## 2. Define Budgets
- **Metric Thresholds**:
  - Accessibility: > 90
  - Performance: > 90
  - Best Practices: > 90
- **Action**: Update `.github/workflows/ci.yml` to run `lhci autorun` after the build step (use `vite preview` as the server command).

## 3. Verification
- **Test**: Open a PR.
- **Check**: CI should fail if the Accessibility score drops below 100 or if the initial bundle size causes a Performance score crash.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (CI/CD pipeline metrics).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
