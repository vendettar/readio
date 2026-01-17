> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` before starting.

# Task: Prevent Direct DB Access (Architecture Guard)

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
