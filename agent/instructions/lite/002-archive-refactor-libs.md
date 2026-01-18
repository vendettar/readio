> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Standardize `src/libs` to `src/lib` [COMPLETED]

> **Status**: Verified by Architect. The `src/libs` directory no longer exists and imports seem to have been updated. This file is kept for historical context.

## Objective
The project currently has a split between `src/lib/` (shadcn default) and `src/libs/` (custom logic). This violates the "Single Source of Truth" and confuses AI agents.
We must merge everything into `src/lib/` to follow standard React/Shadcn patterns.

## Scope
- Directory: `apps/lite/src/`
- Target: Move `apps/lite/src/libs/*` -> `apps/lite/src/lib/`
- Cleanup: Remove `apps/lite/src/libs/`

## Steps

### 1. Move Files
- Move all files and directories from `apps/lite/src/libs/` into `apps/lite/src/lib/`.
- **Conflict Check**: If `apps/lite/src/lib/utils.ts` exists, keep it. If there are other name collisions, list them first. (There shouldn't be, based on audit).

### 2. Update Imports
You need to update all import paths in the codebase.
Scan `apps/lite/src/` (and potentially `apps/lite/tests/`) for:

- `from '@/libs/` -> `from '@/lib/`
- `from '../libs/` -> `from '../lib/`
- `from '../../libs/` -> `from '../../lib/`
- `from '../../../libs/` -> `from '../../../lib/`

**Tools**: Use `sed` or code search-and-replace. Ensure you catch all variations.

### 3. Verify
- Run `pnpm --filter @readio/lite build` to ensure all imports are resolved.
- Run `pnpm --filter @readio/lite test` (or `vitest`) to ensure no logic is broken.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.

## Context
- `src/lib/utils.ts` (Shadcn cn helper) should remain in place.
- All other utility modules (`dexieDb.ts`, `discovery/`, etc.) will now live alongside it in `src/lib/`.

## Final Output
- No `apps/lite/src/libs` directory should exist.
- Build must pass.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

---
## Completion

| Field | Value |
|-------|-------|
| Completed by | (Historical - pre-Leadership) |
| Commands | `pnpm --filter @readio/lite build` |
| Date | Prior to 2026-01-18 |
| Reviewed by | Architect (retroactive verification) |
