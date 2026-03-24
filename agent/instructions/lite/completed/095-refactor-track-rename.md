# Task: 095 - Extract Shared Inline Rename System for TrackCard and FolderCard [COMPLETED]

## Objective
Refactor duplicated inline-rename logic in `TrackCard` and `FolderCard` into shared, testable abstractions without changing existing UI behavior.

## Product Decision (Fixed)
1. Keep current visual UI exactly unchanged for rename inputs, conflict popovers, and action buttons.
2. Extract shared rename state machine into one hook: `useInlineRename`.
3. Extract shared rename input/popup UI into one component: `RenameInput`.
4. Extract `TrackCard` subtitle section into `TrackCardSubtitles` to reduce component size.
5. Preserve all current rename semantics:
   - Enter confirms
   - Escape cancels
   - empty-on-blur cancels
   - conflict keeps edit mode and focus
6. Preserve `FolderCard` click-chain guard:
   - rename confirmation click must not trigger folder navigation in same event chain.
7. Preserve drag safety:
   - rename mode must not accidentally start drag interactions.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema or storage contract changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB behavior changes.
- UI state:
  - Rename behavior preserved in both cards.
- Tests:
  - Add/extend unit/component tests for rename behavior parity and subtitle section extraction safety.

## Hidden Risk Sweep (Required)
- Async control flow:
  - No new async behavior in rename hook; callbacks remain caller-controlled.
- Hot-path performance:
  - Avoid unnecessary re-renders from unstable handler references.
  - Keep card interaction responsiveness under drag/hover unchanged.
- State transition integrity:
  - Prevent invalid transitions (`isRenaming` false while conflict popover still open).
  - Ensure blur/confirm/cancel ordering remains deterministic.
- Dynamic context consistency:
  - Keep i18n-driven conflict message keys per entity type (`trackNameConflict`, `folderNameConflict`).

## Implementation Steps (Execute in Order)
1. **Create shared hook**
   - Add:
     - `apps/lite/src/hooks/useInlineRename.ts`
   - Hook contract (required):
     - Inputs:
       - `originalName: string`
       - `existingNames: string[]`
       - `entityKind: 'track' | 'folder'`
       - `onCommit: (nextName: string) => void`
     - Outputs:
       - `isRenaming`
       - `value`
       - `errorKind: 'conflict' | 'empty' | null`
       - `isConflictOpen`
       - `inputRef`
       - handlers:
         - `startRename`
         - `confirmRename(isBlur?: boolean)`
         - `cancelRename`
         - `setValue`
         - `handleKeyDown`
   - Required behavior:
     - trim + case-insensitive conflict detection
     - self-rename case-change allowed
     - unchanged-after-trim name is a no-op: exit rename mode without calling `onCommit`
     - empty + blur => cancel
     - empty + explicit confirm => mark empty error, keep focus
     - conflict => keep renaming and focus

2. **Create shared rename UI component**
   - Add:
     - `apps/lite/src/components/Files/RenameInput.tsx`
   - Must render:
     - existing `Input`
     - conflict `Popover` style
     - confirm/cancel icon buttons
   - Props must include:
     - `value`, `setValue`
     - `errorKind`, `conflictMessage`
     - `inputRef`
     - `onConfirm`, `onCancel`, `onBlurConfirm`, `onKeyDown`
   - Confirm interaction must be single-fire:
     - clicking confirm must not trigger duplicate confirm via blur + click chain.
     - use deterministic event ordering (e.g., prevent blur-chain double submit on confirm button interaction).
   - Styling must match existing implementation classes.

3. **Extract TrackCard subtitle block**
   - Add:
     - `apps/lite/src/components/Files/TrackCardSubtitles.tsx`
   - Move current subtitle section from `TrackCard` into this component.
   - Preserve:
     - active badge logic
     - play-with-subtitle behavior
     - delete subtitle behavior
     - add subtitle button + subtitle limit behavior.

4. **Refactor TrackCard**
   - Update:
     - `apps/lite/src/components/Files/TrackCard.tsx`
   - Replace local rename states/handlers with `useInlineRename`.
   - Replace inline rename JSX with `RenameInput`.
   - Replace subtitle section JSX with `TrackCardSubtitles`.
   - Preserve existing `handleCardMouseDown` rename-confirm-outside behavior.

5. **Refactor FolderCard**
   - Update:
     - `apps/lite/src/components/Files/FolderCard.tsx`
   - Replace local rename states/handlers with `useInlineRename`.
   - Replace inline rename JSX with `RenameInput`.
   - Preserve `ignoreNextClickRef` behavior to block accidental navigate after rename-confirm click chain.

6. **Keep overflow menu interactions stable**
   - Ensure rename trigger callbacks from:
     - `TrackOverflowMenu`
     - `FolderOverflowMenu`
     still open inline rename exactly as before.

7. **Docs sync (atomic)**
   - Update Files handoff docs to reflect shared rename hook/component architecture without behavior change.

## Acceptance Criteria
- Track and Folder rename UX remains behaviorally identical.
- Conflict and empty validation behavior is unchanged.
- Folder rename confirm click does not trigger folder navigation.
- Track subtitle section behavior remains unchanged after extraction.
- `TrackCard` and `FolderCard` no longer duplicate rename state machine logic.

## Required Tests
1. Add `apps/lite/src/hooks/__tests__/useInlineRename.test.ts`
   - empty confirm vs empty blur behavior
   - conflict detection behavior
   - self-rename case-change behavior
   - enter/escape transitions
2. Add `apps/lite/src/components/Files/__tests__/RenameInput.test.tsx`
   - renders conflict popover when conflict
   - confirm/cancel button behavior
3. Add/update card tests:
   - `apps/lite/src/components/Files/__tests__/TrackCard.rename.test.tsx`
   - `apps/lite/src/components/Files/__tests__/FolderCard.rename.test.tsx`
   - assert folder click-chain guard is preserved
4. Add/update subtitles extraction test:
   - `apps/lite/src/components/Files/__tests__/TrackCardSubtitles.test.tsx`
   - assert active badge and action handlers.
5. Add drag-safety parity test:
   - `apps/lite/src/components/Files/__tests__/TrackCard.rename.test.tsx`
   - `apps/lite/src/components/Files/__tests__/FolderCard.rename.test.tsx`
   - assert rename mode does not start drag interactions.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useInlineRename.test.ts`
- `pnpm -C apps/lite test:run -- src/components/Files/__tests__/RenameInput.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Files/__tests__/TrackCard.rename.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Files/__tests__/FolderCard.rename.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Files/__tests__/TrackCardSubtitles.test.tsx`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/Files/TrackCard.tsx`
  - `apps/lite/src/components/Files/FolderCard.tsx`
  - `apps/lite/src/components/Files/RenameInput.tsx` (new)
  - `apps/lite/src/components/Files/TrackCardSubtitles.tsx` (new)
  - `apps/lite/src/hooks/useInlineRename.ts` (new)
  - related tests under `apps/lite/src/components/Files/__tests__/` and `apps/lite/src/hooks/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`
- Regression risks:
  - blur/confirm ordering regressions
  - folder accidental navigation regression
  - subtitle action wiring regressions after extraction
- Required verification:
  - rename parity tests pass
  - subtitle action tests pass
  - full lite test suite passes

## Forbidden Dependencies
- Do not add new form/state libraries.
- Do not alter visual styling tokens or spacing.
- Do not alter rename product rules or subtitle limit behavior.

## Required Patterns
- Keep Zustand atomic selectors in touched components.
- Keep strong typing; no `any`.
- Keep extracted components focused and behavior-preserving.

## Decision Log
- Required: No.

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite exec vitest run src/hooks/__tests__/useInlineRename.test.ts src/components/Files/__tests__/RenameInput.test.tsx src/components/Files/__tests__/TrackCard.rename.test.tsx src/components/Files/__tests__/FolderCard.rename.test.tsx src/components/Files/__tests__/TrackCardSubtitles.test.tsx`
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-13
