> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` before starting.

# Task: Implement Bundle Size & Perf Budget [COMPLETED]

## Objective
Establish a baseline for application performance and bundle size to prevent regressions during the "UX Upgrade" phase.

## 1. Setup `rollup-plugin-visualizer`
- **Action**: Add the visualizer plugin to `apps/lite/vite.config.ts`.
- **Config**: Generate a `stats.html` file on every build.

## 2. Define CI Budgets
- **Action**: In `apps/lite/package.json`, define a `size-limit` (if using size-limit) or a simple script to check `dist/` size.
- **Default**: Use a simple `dist/` size check script (do not introduce `size-limit` unless already present).
- **Budget**:
  - Main JS Entry: < 250KB (Gzipped).
  - Total Assets: < 1MB (Excluding icons/images).
 - **Rule**: Enforce the budget in CI (Instruction 044).

## 3. Performance Metrics
- **Action**: Implement a simple `useReportWebVitals` hook that logs Core Web Vitals (LCP, FID, CLS) to the `Local Logger` created in Instruction 047.

## 4. Verification
- **Test**: Run `pnpm --filter @readio/lite build`.
- **Check**: Open `stats.html` and verify which libraries (e.g., `framer-motion`, `lucide`) are consuming the most space.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/performance.mdx` (Budgets).
- Update `apps/docs/content/docs/general/technical-roadmap.mdx` (Performance phase).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D013 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: 100% Completed
- **Reviewed by**: Antigravity
- **Date**: 2026-01-29

## Patch Additions (Integrated)
# Patch: 050-implement-bundle-size-and-perf-budget

## Why
Instruction 050 lacks concrete CI enforcement details and overlaps with 077. This patch makes enforcement explicit and avoids drift.

## Additions / Clarifications
- **Single Source of Budget**: Define exact budget thresholds in one location (the script/config used by CI). Do not duplicate numbers in multiple files without a reference.
- **CI Integration**: The budget check must run after `build` and before LHCI (Instruction 077) in `.github/workflows/ci.yml`.
- **Failure Mode**: Budget violation must fail CI (non-zero exit) with a clear message.
- **Artifact**: If `stats.html` is generated, CI should upload it as an artifact for inspection (optional but recommended).

## Verification (add)
- Intentionally inflate bundle (e.g., import a large dependency) and confirm CI fails on budget.


# Patch: 050-implement-bundle-size-and-perf-budget

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
- CI enforcement and artifact upload (see patch 050).
