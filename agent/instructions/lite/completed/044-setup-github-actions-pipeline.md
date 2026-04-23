> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Setup CI Pipeline (GitHub Actions) [COMPLETED]

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

## Completion
- **Status**: 100% Completed
- **Reviewed by**: Antigravity
- **Date**: 2026-01-29

## Patch Additions (Integrated)
# Patch: 044-setup-github-actions-pipeline

## Why
Instruction 044 is now out of sync with the actual CI pipeline (build, LHCI, bundle budgets, e2e). This patch clarifies the required steps and dependencies so reviewers and workers align with current CI.

## Additions / Clarifications
- **CI Steps (authoritative order)**:
  1) Install + cache
  2) Lint
  3) Typecheck
  4) Build
  5) Bundle budget check (Instruction 050)
  6) Lighthouse CI (Instruction 077)
  7) Unit tests
  8) E2E smoke tests
- **Dependency**: Instruction 050 defines budget logic; Instruction 077 defines LHCI config. If either changes, CI must be updated.
- **Trigger**: `push` and `pull_request` on `main` only (explicitly state; no wildcard).
- **Failure Rules**: Any step failure blocks merge; do not mark 044 complete unless CI is green.

## Verification (unchanged)
- Open a PR; verify all steps above run and fail correctly on injected errors.


# Patch: 044-setup-github-actions-pipeline

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
- Explicit ordering and dependency with 050/077 (already in patch 044).
