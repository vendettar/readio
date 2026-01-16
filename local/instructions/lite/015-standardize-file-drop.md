> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Standardize File Drop (`react-dropzone`)

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

## 2. Refactor Drop Areas
- **Target**: `apps/lite/src/components/Files/FileDropZone.tsx` (or similar).
- **Action**: Use `useDropzone`.
- **Validation**: On drop, validate each file against `audioFileSchema`. Reject invalid files with a Toast error.

## 3. Visual Feedback
- **Action**: Use the `.is-dragging` global class (from `design-system.mdx`) or `dropzone` state to show a "Drop Here" overlay.
- **Constraint**: Overlay should use Glassmorphism style (`backdrop-blur-md`).

## 4. Verification
- **Test**: Drag a non-audio file (e.g. PDF). It should be rejected.
- **Test**: Drag a valid MP3. It should be accepted.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.