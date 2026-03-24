> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/standards.mdx` before starting.

# Task: Normalize Test File Placement [COMPLETED]

## Objective
Eliminate duplicate or misplaced tests by colocating tests with their target modules, while keeping shared test infra in `src/__tests__`.

## Scope Scan (Pre-Instruction)
- **Config**: No config changes.
- **Persistence**: No data layer changes.
- **Routing**: No route changes.
- **Logging**: No logging changes.
- **Network**: No network changes.
- **Storage**: No storage changes.
- **UI State**: No UI changes.
- **Tests**: File moves only; update import paths if needed.

## 1. Colocation Rules
- **Component tests** → `apps/lite/src/components/**/__tests__`
- **Hook tests** → `apps/lite/src/hooks/__tests__`
- **Store tests** → `apps/lite/src/store/__tests__`
- **Lib/utility tests** → `apps/lite/src/lib/__tests__`
- **Shared test infra** stays in `apps/lite/src/__tests__` (e.g., `setup.ts`, `handlers.ts`).

## 2. Move / Deduplicate Tests
- **Keep**: `apps/lite/src/__tests__/setup.ts`, `apps/lite/src/__tests__/handlers.ts`
- **Delete duplicates**:
  - If a test already exists in the correct colocated directory, remove the root copy.
- **Move (if not already present)**:
  - `apps/lite/src/__tests__/episodeRowErrorBoundary.test.tsx`
    → `apps/lite/src/components/EpisodeRow/__tests__/EpisodeRowErrorBoundary.test.tsx` (keep only one)
  - `apps/lite/src/__tests__/exploreStore.test.ts`
    → `apps/lite/src/store/__tests__/exploreStore.test.ts`
  - `apps/lite/src/__tests__/playerStore.test.ts`
    → `apps/lite/src/store/__tests__/playerStore.test.ts` (if duplicate exists, keep the more complete version and delete the other)
  - `apps/lite/src/__tests__/subtitles.test.ts`
    → `apps/lite/src/lib/__tests__/subtitles.test.ts`
  - `apps/lite/src/__tests__/useFileHandler.test.ts`
    → `apps/lite/src/hooks/__tests__/useFileHandler.test.ts`
  - `apps/lite/src/__tests__/useSession.test.ts`
    → `apps/lite/src/hooks/__tests__/useSession.test.ts`

## 3. Verification
- **Check**: Ensure test imports still resolve after moves.
- **Run**: `pnpm --filter @readio/lite lint`

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx` and `.zh.mdx` with test placement rules.
- Update `agent/role-prompt/worker-role` to enforce colocated test placement.

## Forbidden Dependencies
- No new packages.
- No changes to runtime logic or UI behavior.

## Required Patterns
- Colocated tests only, shared infra remains in `src/__tests__`.

## Completion
Completed by: Antigravity
Commands: pnpm --filter @readio/lite lint
Date: 2026-02-05

## Patch Additions (Integrated)
# Patch: 083-test-file-placement-cleanup

## Why
The project SSOT already defines test placement rules. This patch must align with the existing handoff standards to avoid conflicting guidance.

## Required Change (aligned with SSOT)
- Keep `src/__tests__` for **shared test infra only** (e.g., `setup.ts`, `handlers.ts`).
- All module tests must be colocated under their module folder `__tests__`.
- **Do not add** new test files at the root `src/__tests__` level.

## Notes
- This patch **does not** move shared infra to `src/testUtils/`.
- This patch **does not** require emptying `src/__tests__`.
