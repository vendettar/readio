# Task: 091 - Standardize DnD Coordinate Modifier (No Overlay Width Refactor) [COMPLETED]

## Precondition (Must)
- Instruction 091 must be completed and review-signed before starting 091b.
- Do not run 091 and 091b in parallel because both touch Files drag preview behavior and can create review ambiguity.

## Objective
Remove duplicated drag-coordinate logic in Files pages by extracting one shared `dnd-kit` modifier utility.

This instruction only covers coordinate modifier consolidation.
DragOverlay width/size mechanism changes are deferred to **091b**.

## Product Decision (Fixed)
1. Keep current drag-preview behavior (preview remains centered under pointer/finger).
2. Keep existing DragOverlay width behavior unchanged in this instruction.
3. Extract one shared modifier from page-level duplication.
4. Shared modifier must support both mouse and touch activator events.
5. `FilesIndexPage` and `FilesFolderPage` must consume the same exported modifier.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No DB/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - No behavior changes outside drag preview positioning parity.
- Tests:
  - Add unit tests for shared modifier event parsing and transform output.

## Hidden Risk Sweep (Required)
- Async control flow:
  - No async changes in this task.
- Hot-path performance:
  - Shared modifier must avoid unnecessary allocations and branch churn.
  - Keep same per-frame complexity as current implementation.
- State transition integrity:
  - Drag start/end/cancel behavior from `useFileDragDrop` must remain unchanged.
- Dynamic context consistency:
  - Pointer normalization must handle touch/mouse activatorEvent variants deterministically.

## Implementation Steps (Execute in Order)
1. **Create shared modifier module**
   - Add:
     - `apps/lite/src/lib/dnd/modifiers.ts`
   - Export:
     - `snapCenterCursor`
   - Implementation requirement:
     - Read position from `activatorEvent`.
     - Support mouse (`clientX/clientY`) and touch (`touches[0] ?? changedTouches[0]`).
     - If required data is missing, return original transform unchanged.
     - Keep transform math contract identical to current behavior:
       - `x: transform.x + (clientX - activeNodeRect.left)`
       - `y: transform.y + (clientY - activeNodeRect.top)`

2. **Replace duplicated local modifier definitions**
   - Remove page-local `snapCenterCursor` constants from:
     - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
     - `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`
   - Import shared utility from `src/lib/dnd/modifiers`.
   - Do not change DragOverlay JSX structure in this instruction.

3. **Keep overlay width sizing untouched**
   - Leave `folderCardWidthPx` / `ResizeObserver` and drag-preview width logic unchanged in `FilesIndexPage`.
   - Leave folder page overlay width behavior unchanged.
   - Overlay sizing simplification will be handled by 091b only.

4. **Add focused unit tests**
   - Add:
     - `apps/lite/src/lib/dnd/__tests__/modifiers.test.ts`
   - Cover:
     - mouse activator event computes offset transform.
     - touch activator event computes offset transform from `touches[0]`.
     - touch activator event computes offset transform from `changedTouches[0]` when `touches` is empty.
     - missing `activatorEvent` or `activeNodeRect` returns original transform.
     - missing touch coordinates returns original transform.

5. **Docs sync (atomic)**
   - Update Files handoff docs to state that drag coordinate modifier is centralized in `src/lib/dnd/modifiers.ts`.

## Acceptance Criteria
- Both Files pages use the same imported `snapCenterCursor`.
- No duplicated local modifier implementation remains in page files.
- Drag preview remains centered under pointer/finger on desktop and mobile touch.
- No visual/interaction regressions in drag start, move, drop, cancel.
- Modifier output is mathematically equivalent to pre-refactor behavior for the same input event/rect.

## Required Tests
1. `apps/lite/src/lib/dnd/__tests__/modifiers.test.ts`
   - event normalization and transform behavior matrix.
2. Targeted manual regression checks:
   - root files page drag file/folder.
   - folder detail page drag file to targets.
   - touch-device simulation drag path.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/dnd/__tests__/modifiers.test.ts`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/dnd/modifiers.ts` (new)
  - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
  - `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`
  - `apps/lite/src/lib/dnd/__tests__/modifiers.test.ts` (new)
  - docs under `apps/docs/content/docs/apps/lite/handoff/features/files-management*`
- Regression risks:
  - touch activatorEvent parsing mismatch
  - subtle offset drift due to transform math differences
- Required verification:
  - shared module adoption confirmed
  - unit tests and manual drag checks pass

## Forbidden Dependencies
- Do not add new DnD libraries.
- Do not refactor DragOverlay width sizing in this instruction.
- Do not change `useFileDragDrop` behavior or routing.

## Required Patterns
- Keep Zustand atomic selector usage in touched components.
- Keep deterministic fallback behavior when activator data is unavailable.

## Decision Log
- Required: No.

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/lib/dnd/__tests__/modifiers.test.ts`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-11
