# Task: 104 - Modularize Files Index Page into Explicit UI Sections [COMPLETED]

## Objective
Refactor `FilesIndexPage` into a clear orchestration page plus focused section components, without changing current file/folder behavior, drag-and-drop semantics, or playback interactions.

## Product Decision (Fixed)
1. Keep `apps/lite/src/routeComponents/files/FilesIndexPage.tsx` as page orchestrator and DnD boundary owner.
2. Add focused UI components under `apps/lite/src/components/Files/`:
   - `FilesPageHeader.tsx`
   - `NewFolderCard.tsx`
   - `FoldersGridSection.tsx`
   - `TracksListSection.tsx`
   - `FileDragPreview.tsx`
   - `FilesLoadingSkeletons.tsx`
3. Keep existing hooks as business-logic owners:
   - `useFilesData`
   - `useFileProcessing`
   - `useFileDragDrop`
   - `useFolderManagement`
   - `useFilePlayback`
4. Keep `FolderCard`, `TrackCard`, `ViewControlsBar`, and `FileDropZone` as-is; consume them from new section components.
5. Preserve all current layout behavior by density mode (`comfortable` / `compact`).

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No DB schema or settings key changes.
- Routing:
  - No route changes.
- Logging:
  - Keep existing file-operation logging behavior unchanged.
- Network:
  - No network changes.
- Storage:
  - Keep existing IndexedDB write/read flows unchanged.
- UI state:
  - Structural extraction only.
- Tests:
  - Add component tests for extracted sections and keep integration behavior checks.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Preserve request-guard semantics from `useFilesData` and async completion callbacks.
- Hot-path performance:
  - Avoid unnecessary rerender fan-out for track lists and folder grids.
- State transition integrity:
  - Keep drag lifecycle cleanup deterministic (`document.body.classList` and preview reset).
- Dynamic context consistency:
  - Keep i18n labels reactive in extracted components.

## Implementation Steps (Execute in Order)
1. **Extract page header component**
   - Add:
     - `apps/lite/src/components/Files/FilesPageHeader.tsx`
   - Required behavior:
     - render title/subtitle exactly as current root/folder logic.
     - keep "New Folder" and "Add Audio" action semantics unchanged.

2. **Extract new-folder inline card**
   - Add:
     - `apps/lite/src/components/Files/NewFolderCard.tsx`
   - Required props:
     - `value`, `onChange`, `onConfirm`, `onCancel`, `inputRef`, `containerRef`.
   - Required behavior:
     - preserve enter/escape/blur behavior.
     - preserve mouse-down prevention on action buttons.

3. **Extract folders section**
   - Add:
     - `apps/lite/src/components/Files/FoldersGridSection.tsx`
   - Required behavior:
     - render heading/helper text conditions unchanged.
     - render naming card + folder cards in current order.
     - preserve density-based grid classes.

4. **Extract tracks section**
   - Add:
     - `apps/lite/src/components/Files/TracksListSection.tsx`
   - Required behavior:
     - preserve root/folder empty-state logic.
     - preserve track-card callbacks and subtitles wiring.
     - preserve section heading visibility conditions.

5. **Extract drag preview and skeleton helpers**
   - Add:
     - `apps/lite/src/components/Files/FileDragPreview.tsx`
     - `apps/lite/src/components/Files/FilesLoadingSkeletons.tsx`
   - Required behavior:
     - drag preview width CSS variable and density classes unchanged.
     - skeleton block structure unchanged.

6. **Refactor FilesIndexPage composition**
   - Update:
     - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
   - Required behavior:
     - keep `DndContext` and `DragOverlay` ownership in page.
     - keep all hook wiring and callback semantics unchanged.
     - replace inline section JSX with extracted components.

7. **Docs sync (atomic)**
   - Update files-management and architecture docs to reflect sectionized Files page ownership.

## Acceptance Criteria
- Files page behavior is unchanged for users.
- Drag-and-drop still works for move-to-folder and preview rendering.
- New folder naming flow still supports enter/escape/blur exactly as before.
- Track operations (play, rename, delete, subtitle actions, move) remain unchanged.
- `FilesIndexPage.tsx` is reduced to orchestration and section composition.

## Required Tests
1. Add:
   - `apps/lite/src/components/Files/__tests__/NewFolderCard.test.tsx`
   - Assert enter confirm, escape cancel, and blur confirm behavior.
2. Add:
   - `apps/lite/src/components/Files/__tests__/FileDragPreview.test.tsx`
   - Assert density class rendering and width variable application.
3. Add:
   - `apps/lite/src/components/Files/__tests__/FoldersGridSection.test.tsx`
   - Assert naming card visibility and folder list rendering conditions.
4. Add:
   - `apps/lite/src/routeComponents/files/__tests__/FilesIndexPage.sections.test.tsx`
   - Assert root/folder mode transitions and no regression in section rendering.
5. Add:
   - `apps/lite/src/routeComponents/files/__tests__/FilesIndexPage.dnd-lifecycle.test.tsx`
   - Assert drag start/drag end lifecycle parity, including drag preview visibility and cleanup behavior.
6. Keep existing ingestion/path tests green:
   - `apps/lite/src/hooks/__tests__/useFileHandler.test.ts`
   - `apps/lite/src/lib/files/__tests__/sortFolders.test.ts`

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/Files/__tests__/NewFolderCard.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Files/__tests__/FileDragPreview.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Files/__tests__/FoldersGridSection.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/files/__tests__/FilesIndexPage.sections.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/files/__tests__/FilesIndexPage.dnd-lifecycle.test.tsx`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useFileHandler.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/files/__tests__/sortFolders.test.ts`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/Files/FilesPageHeader.tsx` (new)
  - `apps/lite/src/components/Files/NewFolderCard.tsx` (new)
  - `apps/lite/src/components/Files/FoldersGridSection.tsx` (new)
  - `apps/lite/src/components/Files/TracksListSection.tsx` (new)
  - `apps/lite/src/components/Files/FileDragPreview.tsx` (new)
  - `apps/lite/src/components/Files/FilesLoadingSkeletons.tsx` (new)
  - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
  - tests under:
    - `apps/lite/src/components/Files/__tests__/`
    - `apps/lite/src/routeComponents/files/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- Regression risks:
  - drag preview style drift
  - callback wiring omissions in extracted sections
  - folder/track empty-state condition regressions
- Required verification:
  - section tests pass
  - existing file-flow tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new DnD libraries.
- Do not change file/folder data model.
- Do not alter route-level folder navigation contract.

## Required Patterns
- Page = orchestration, sections = rendering.
- Keep density behavior driven by props.
- Keep hook ownership for business logic unchanged.

## Decision Log
- Required: No (behavior-preserving modular refactor).

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec vitest run src/components/Files/__tests__/NewFolderCard.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Files/__tests__/FileDragPreview.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Files/__tests__/FoldersGridSection.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/routeComponents/files/__tests__/FilesIndexPage.sections.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/routeComponents/files/__tests__/FilesIndexPage.dnd-lifecycle.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/hooks/__tests__/useFileHandler.test.ts`
  - `pnpm -C apps/lite exec vitest run src/lib/files/__tests__/sortFolders.test.ts`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
