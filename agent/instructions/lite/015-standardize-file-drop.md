> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Standardize File Drop (`react-dropzone`) [COMPLETED]

## Objective
Replace any manual `ondrop` handlers with `react-dropzone` for consistent drag-and-drop behavior and visual feedback.

## 1. Create File Validation Schema (`apps/lite/src/lib/schemas/files.ts`)
- **Action**: Define a Zod schema for file ingestion.
  ```ts
  export const audioFileSchema = z.object({
    name: z.string(),
    size: z.number().max(500 * 1024 * 1024), // 500MB limit
    type: z.string().refine(val => val.startsWith('audio/'), "Must be audio")
  });
  ```
 - **Dependency Check**: Ensure `react-dropzone` is installed.

## 2. Refactor Drop Areas
- **Target**: `apps/lite/src/components/Files/FileDropZone.tsx` (or similar).
- **Action**: Use `useDropzone`.
- **Validation**: On drop, validate each file against `audioFileSchema`. Reject invalid files with a Toast error.
 - **Cleanup**: Remove any manual `ondrop`/`dragenter` handlers to prevent double ingestion.
 - **I18n**: Add translation keys for invalid file errors in `apps/lite/src/lib/translations.ts`.

## 3. Visual Feedback
- **Action**: Use the `.is-dragging` global class (from `design-system/index.mdx`) or `dropzone` state to show a "Drop Here" overlay.
- **Constraint**: Overlay should use Glassmorphism style (`backdrop-blur-md`).

## 4. Verification
- **Test**: Drag a non-audio file (e.g. PDF). It should be rejected.
- **Test**: Drag a valid MP3. It should be accepted.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`.
- Update `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: Completed
- **Date**: 2026-01-21
- **Completed by**: Antigravity (AI Assistant)
- **Reviewed by**: Readio Reviewer (QA)
- **Commands**: 
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite lint`
  - `pnpm --filter @readio/lite build`
- **Key Changes**:
  - Created `FileDropZone.tsx` component using react-dropzone
  - Updated `fileSchema.ts` with size limits and validation helpers
  - Added `handleDroppedFiles` to `useFileProcessing` hook
  - Wrapped FilesIndexPage content with FileDropZone
  - Added i18n keys for all 6 languages
  - Updated documentation with drag-and-drop section
- **Verification**:
  - Typecheck passed: ✅
  - Lint passed: ✅
  - Build passed: ✅
