> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` and `agent/instructions/lite/044-setup-github-actions-pipeline.md` before starting.

# Task: Add Lighthouse CI Budget [COMPLETED]

## Objective
Enforce performance and accessibility standards automatically in the CI pipeline to prevent quality regression.

## 1. Setup Lighthouse CI
- **Action**: Install `@lhci/cli` in the monorepo.
- **Config**: Add `.lighthouserc.json` to `apps/lite`.
- **Run Command**: `pnpm --filter @readio/lite exec lhci autorun --config=apps/lite/.lighthouserc.json`.

## 2. Define Budgets
- **Metric Thresholds**:
  - Accessibility: **>= 95**
  - Performance: **>= 90**
  - Best Practices: **>= 90**
- **Config Requirements** (`apps/lite/.lighthouserc.json`):
  - `collect.url`: `http://localhost:4173/`
  - `collect.startServerCommand`: `pnpm --filter @readio/lite preview -- --host 127.0.0.1 --port 4173`
  - `collect.startServerReadyPattern`: `Local:`
  - `collect.numberOfRuns`: `1` (can raise later)
  - `assert.assertions`: use the thresholds above
  - `upload.target`: `temporary-public-storage` (CI-only)
- **Action**: Update `.github/workflows/ci.yml` to run the LHCI command after the build step.

## 3. Verification
- **Test**: Open a PR.
- **Check**: CI should fail if any score falls below the thresholds above.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (CI/CD pipeline metrics).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
Completed by: Antigravity
Commands: pnpm --filter @readio/lite typecheck && pnpm --filter @readio/lite lint
Date: 2026-02-05

## Patch Additions (Integrated)
# Patch: 077-add-lighthouse-ci-a11y-budget

## Why
`pnpm --filter @readio/lite exec lhci` may fail **only if** the `lhci` binary is not resolved in CI.

## Conditional Change (only if CI fails with `lhci: command not found`)
- Replace the CI command with: `pnpm -w exec lhci autorun --config=apps/lite/.lighthouserc.json`.

## Otherwise
- If CI already passes, **no change is required**.
