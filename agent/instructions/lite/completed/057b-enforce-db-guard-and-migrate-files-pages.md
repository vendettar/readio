> **⚠️ CRITICAL**: Preserve current UI/UX layout and styling. This task is architecture hygiene, not a UI redesign.
> **Prerequisites**: Re-read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` and `apps/docs/content/docs/apps/lite/handoff/database.mdx` before starting.

# Task: 057b — Enforce DB Access Guard + Remove Remaining Direct DB Calls (Files Pages)

## Goal
Close the remaining gaps in the “Store/Hook-first persistence” rule by eliminating **runtime DB calls** from `src/components/**` and `src/routeComponents/**` (focus: Files pages), and enforcing a guard in CI to prevent regression.

## Context (Why This Exists)
There is evidence of remaining direct DB usage in route/components (especially Files routes), which means the layering rule can still regress silently. This task is intentionally scoped to avoid a large hook refactor that would create cascading risk.

## Scope Scan (8 Scopes)
- **Config**: Yes (add a guard script and wire into CI).
- **Persistence**: No schema changes; only access patterns.
- **Routing**: No route changes; ensure navigation behavior unchanged.
- **Logging**: No new logging; ensure errors still surface via existing error handling policy.
- **Network**: No.
- **Storage**: No.
- **UI state**: Yes (Files pages depend on async actions); must preserve loading/optimistic UX.
- **Tests**: Yes (update/add tests if needed; all gates must pass).

## Hidden Risk Sweep
- **Async control flow**: Moving DB calls into hooks/stores can introduce duplicate fetches or stale closure bugs. Require cancelation guards and stable dependencies.
- **Hot path performance**: Avoid adding “load everything” patterns or extra revalidation loops; keep operations targeted.

## Decision Log / Bilingual Sync
- **Decision Log**: Waived (policy enforcement / guard; no user-visible feature change).
- **Bilingual Sync**: Required (docs touched have `.zh.mdx` counterparts).

---

## Required Patterns
- **Forbidden (runtime DB access in UI)**:
  - Any `import { DB } from '.../dexieDb'` inside `src/components/**` or `src/routeComponents/**`.
  - Any direct calls like `DB.update.../DB.delete.../DB.get...` inside `src/components/**` or `src/routeComponents/**`.
- **Allowed (temporary, type-only)**:
  - `import type { ... } from '.../dexieDb'` may remain short-term, but should be migrated to a non-DB types module when convenient.
  - The guard MUST distinguish type-only imports from runtime access to avoid false positives.
- **Access flow**:
  - Route/components call **hooks or store actions** only.
  - Hooks/store actions call `DB.*`.

## Forbidden Dependencies
- Do not add new linting dependencies. Use `rg`/Node scripts already available.

---

## Tasks (Do in order)
1. **Audit current violations (baseline list)** → Verify: the list is captured in the PR description.
   - Commands (examples):
     - `rg -n "import\\s*\\{\\s*DB\\s*\\}\\s*from\\s*['\\\"].*dexieDb['\\\"]" apps/lite/src/components apps/lite/src/routeComponents`
     - `rg -n "\\bDB\\." apps/lite/src/components apps/lite/src/routeComponents`
     - `rg -n "import\\s+type\\s+\\{[^}]+\\}\\s+from\\s+['\\\"].*dexieDb['\\\"]" apps/lite/src/components apps/lite/src/routeComponents`

2. **Add `lint:db-guard` script (precise guard)** → Verify: running it fails when you intentionally add a runtime `DB` import, and passes otherwise.
   - Implement a guard script that:
     - Flags runtime imports of `DB` from `dexieDb`.
     - Flags `DB.` usage.
     - Does NOT fail on `import type { ... } from '.../dexieDb'`.

3. **Wire `lint:db-guard` into CI** → Verify: CI runs it (same job as lint/typecheck).
   - Integrate into the existing CI workflow (Instruction 044 pipeline).

4. **Migrate Files pages off direct DB calls (no API churn)** → Verify: `rg "\\bDB\\." ...` returns zero for Files routes.
   - Primary targets (expected high impact):
     - `src/routeComponents/files/FilesIndexPage.tsx`
     - `src/routeComponents/files/FilesFolderPage.tsx`
   - Strategy:
     - Add missing operations into existing Files hooks (e.g., `useFolderManagement`, `useFileProcessing`) or store actions.
     - Keep hook public API stable where possible; add small new methods instead of refactoring return shapes.

5. **Migrate any remaining component/route DB call sites** → Verify: no runtime DB access remains in `components/**` and `routeComponents/**`.
   - After Files pages, re-run the audit searches and clear remaining `DB.` call sites.

6. **Docs update (layering rule + DB guard)** → Verify: docs match actual guard command and paths.
   - Update:
     - `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` + `.zh.mdx` (explicitly mention `lint:db-guard`).
     - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` + `.zh.mdx` (restate “UI must not touch DB”).

7. **Verification pass (zero-warning policy)** → Verify: all commands exit 0.
   - `pnpm --filter @readio/lite lint`
   - `pnpm --filter @readio/lite typecheck`
   - `pnpm --filter @readio/lite test:run`
   - `pnpm --filter @readio/lite build`

---

## Done When
- `src/components/**` and `src/routeComponents/**` contain **no runtime DB imports** and **no `DB.` calls**.
- `lint:db-guard` runs locally and in CI.
- Docs updated (English + Chinese) and reflect the exact guard behavior/commands.

## Completion
- **Completed by**: Claude (Antigravity Agent)
- **Commands**:
  - `pnpm --filter @readio/lite lint:db-guard` - ✅ No violations found
  - `pnpm --filter @readio/lite lint` - ✅ Passed
  - `pnpm --filter @readio/lite typecheck` - ✅ Passed
  - `pnpm --filter @readio/lite test:run` - ✅ All 161 tests passed
  - `pnpm --filter @readio/lite build` - ✅ Build successful
- **Date**: 2026-01-30
- **Status**: ✅ **Fully Complete**
  - All route components refactored to use stores (historyStore, filesStore)
  - `lint:db-guard` integrated into CI pipeline
  - Documentation updated (English + Chinese)
  - Zero DB access violations in UI layer

## Patch Additions (Integrated)
# Patch: 057b-enforce-db-guard-and-migrate-files-pages

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
