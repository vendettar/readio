> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/monorepo-strategy.mdx` before starting.

# Task: Harden Turborepo Cache Config

## Objective
Eliminate "stale build" issues and slow CI runs by perfecting the input/output mapping in Turborepo.

## 1. Audit `turbo.json`
- **Action**: Define explicit `inputs` for the `build` pipeline (e.g., source files, configs, `package.json`).
- **Action**: Define explicit `outputs` (e.g., `dist/**`, `.next/**`, `stats.html`).

## 2. Dependency Graph
- **Requirement**: Ensure `apps/lite` depends on shared packages that exist in this repo (e.g., `packages/core`), so rebuilds trigger only when required.

## 3. Verification
- **Test**: Run `pnpm build`. Run it again immediately. The second run MUST be a "FULL TURBO" cache hit.
- **Test**: Modify a file in `packages/core`. Re-run build. Turbo MUST detect the change and rebuild `apps/lite`.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/monorepo-strategy.mdx` (Cache policy).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D029 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Patch Additions (Integrated)
# Patch: 066-harden-turborepo-cache-config

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
- Define cache key stability rules and document them.
