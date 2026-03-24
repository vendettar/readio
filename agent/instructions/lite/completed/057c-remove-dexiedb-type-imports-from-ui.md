> **⚠️ CRITICAL**: Preserve current UI/UX layout and styling. This task is type-boundary hardening only.
> **Prerequisites**: Re-read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` and `apps/docs/content/docs/apps/lite/handoff/database.mdx`.
> **Dependency**: Execute 057b first (runtime DB access guard + removal). 057c assumes UI no longer calls `DB.*` directly.

# Task: 057c — Remove `dexieDb` Type Imports From UI Layer (Type Boundary Hardening)

## Goal
Eliminate **all** imports from `src/lib/dexieDb.ts` in the UI layer, including **type-only imports**, to fully enforce the boundary:

- UI (`src/components/**`, `src/routeComponents/**`) must not depend on the persistence implementation module (`dexieDb.ts`).

This reduces coupling and prevents “implementation leakage” into UI code, enabling future persistence refactors (migrations, versioning, alternative storage) without wide UI churn.

## Scope Scan (8 Scopes)
- **Config**: Yes (extend DB guard to include type-only imports once migration is complete).
- **Persistence**: No schema changes.
- **Routing**: No.
- **Logging**: No.
- **Network**: No.
- **Storage**: No.
- **UI State**: No behavior changes allowed; types only.
- **Tests**: Yes (must pass all gates).

## Hidden Risk Sweep
- **Accidental runtime import**: Ensure the replacement type module exports **types only** (no values) to avoid pulling DB code into UI by mistake.
- **Drift**: DB entity types must remain source-of-truth consistent with Dexie tables; define an ownership rule to avoid mismatched shapes.

## Decision Log / Bilingual Sync
- **Decision Log**: Waived (type boundary tightening; no product behavior change).
- **Bilingual Sync**: Required (docs touched have `.zh.mdx` counterparts).

---

## Target State
1. In `apps/lite/src/components/**` and `apps/lite/src/routeComponents/**`:
   - **Zero** occurrences of:
     - `from '../lib/dexieDb'` / `from '../../lib/dexieDb'` / any path ending in `lib/dexieDb`
     - including `import type { ... } from ...`
2. DB entity type definitions used by UI must come from a **type-only module** (example naming below).
3. The DB guard (`lint:db-guard`) must be upgraded to fail on type-only imports after migration.

---

## Implementation Approach (Recommended)

### A) Introduce a Dedicated Type Module
Create a new module that exports DB entity shapes as **types only**, for UI consumption:
- Suggested path: `apps/lite/src/lib/db/types.ts`
- Contents:
  - `export type { FileTrack, FileFolder, FileSubtitle, PlaybackSession, Subscription, Favorite, ... }`
  - No runtime values. Avoid exporting `DB` or any Dexie instance.

Ownership rule:
- `dexieDb.ts` remains the single source of truth for the schema & runtime operations.
- `lib/db/types.ts` is the **public type surface** for UI + hooks; it should re-export or mirror types in a stable way.

### B) Migrate UI Type Imports
Replace all UI imports like:
- `import type { FileFolder } from '../../lib/dexieDb'`
with:
- `import type { FileFolder } from '../../lib/db/types'`

### C) Tighten the Guard
Update `lint:db-guard` to fail on any `dexieDb` imports in UI, including `import type`.

---

## Tasks (Do in order)
1. **Inventory type-only imports** → Verify: the list is captured in PR description.
   - `rg -n \"import\\s+type\\s+\\{[^}]+\\}\\s+from\\s+['\\\"].*lib/dexieDb['\\\"]\" apps/lite/src/components apps/lite/src/routeComponents`

2. **Add the type surface module** → Verify: it exports types only and has no runtime imports that pull Dexie.
   - Create: `apps/lite/src/lib/db/types.ts`
   - Ensure it has **no** `import { DB } ...` and **no** side-effect imports.

3. **Migrate UI type imports** → Verify: `rg \"lib/dexieDb\"` returns zero for UI layer.
   - Replace imports across:
     - `src/components/**`
     - `src/routeComponents/**`

4. **Optionally migrate hooks/stores** (only if needed) → Verify: no circular deps and typecheck passes.
   - If hooks/stores currently export types referencing `dexieDb` entities, migrate them to use `lib/db/types.ts` too.

5. **Upgrade `lint:db-guard`** → Verify: it now fails on any UI import from `dexieDb` (including `import type`).

6. **Docs update** → Verify: docs state the new type boundary and point to the right module.
   - Update:
     - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` + `.zh.mdx`
     - `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` + `.zh.mdx`
   - Add a short rule: “UI imports DB entity types from `src/lib/db/types.ts`, never from `dexieDb.ts`.”

7. **Verification pass** → Verify: all commands exit 0.
   - `pnpm --filter @readio/lite lint`
   - `pnpm --filter @readio/lite typecheck`
   - `pnpm --filter @readio/lite test:run`
   - `pnpm --filter @readio/lite build`

---

## Done When
- No UI file imports anything from `lib/dexieDb` (including type-only).
- A stable type surface exists (`src/lib/db/types.ts`) and is used everywhere UI needs DB entity shapes.
- Guard enforces the rule, and docs reflect the new boundary (EN + ZH).

## Completion
- **Completed by**: Claude (Antigravity Agent)
- **Commands**:
  - Created `src/lib/db/types.ts` - Type-only surface module for UI layer
  - Migrated 7 UI files to use `lib/db/types` instead of `dexieDb`
  - Updated `lint:db-guard` to fail on ANY dexieDb imports (including type-only)
  - `pnpm --filter @readio/lite lint:db-guard` - ✅ No violations
  - `pnpm --filter @readio/lite lint` - ✅ Passed
  - `pnpm --filter @readio/lite typecheck` - ✅ Passed
  - `pnpm --filter @readio/lite test:run` - ✅ All 161 tests passed
  - `pnpm --filter @readio/lite build` - ✅ Build successful
- **Date**: 2026-01-30
- **Status**: ✅ **Fully Complete**
  - Zero imports from dexieDb in UI layer (including type-only)
  - Type boundary hardened with dedicated type surface module
  - Guard updated to enforce the stricter rule
  - Documentation updated (English + Chinese)

## Patch Additions (Integrated)
# Patch: 057c-remove-dexiedb-type-imports-from-ui

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
