> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` before starting.

# Task: Prevent Direct DB Access (Architecture Guard) [COMPLETED]

## Objective
Enforce the "Store-First Persistence" rule by preventing UI components from importing the database layer directly.

## 1. Guard Rule
- **Action**: Add a guard script (e.g., `pnpm lint:db-guard`) that fails when `dexieDb.ts` is imported from `src/components/**` or `src/routeComponents/**`.
  - Use `rg "dexieDb" apps/lite/src/components apps/lite/src/routeComponents` and fail if any match is found.
## 2. Lint/CI Integration
- **Action**: Run the guard in CI (Instruction 044) and document it as mandatory in local checks.

## 3. Audit Usages
- **Scan**: Search for `import { db } from` or `import { DB } from` in `src/components/` and `src/routeComponents/`.
- **Fix**: Move the logic into a store action and call the store from the component instead.

## 4. Verification
- **Run**: `grep -r "dexieDb" src/components`.
- **Check**: Zero results should be returned.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` (Layering rules).
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D020 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Claude (Autopilot)
- **Commands**:
  - `pnpm --filter @readio/lite lint:db-guard`
  - `pnpm --filter @readio/lite lint`
- **Date**: 2026-01-30
- **Reviewed by**: CODEX
- **Status**: ✅ **Fully Complete**
  - DB access guard enforced in src/components and src/routeComponents
  - Lint rule integrated into CI
  - Logic flow and architecture docs updated

## Patch Additions (Integrated)
# Patch: 057-prevent-direct-db-access-lint-rule

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
- CI guard at root; forbid Dexie types in UI packages.
