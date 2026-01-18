> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`, `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx`, and `apps/docs/content/docs/general/security.mdx` before starting.

# Task: Integrate Robust Metadata Parser

## Objective
Replace "hand-rolled" filename parsing with a professional binary stream parser to extract high-quality metadata (Cover, Album, Duration) from local files.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Install Library
- **Action**: `pnpm --filter @readio/lite add music-metadata-browser`.
- **Reason**: This is the industry standard for browser-based audio metadata extraction.

## 2. Refactor Ingestion Logic
- **Target**: `apps/lite/src/lib/files/ingest.ts`.
- **Action**: Update the metadata extraction step using a **Web Worker**.
- **Logic**:
  - Use `parseBlob(file)` from `music-metadata-browser` inside a Worker to avoid blocking the main thread.
  - Prefer `common.picture` for artwork (convert to `Blob`/`ObjectURL` only when needed in UI).
  - Prefer `format.duration` if provided; fall back to `getAudioDuration` only when metadata lacks duration.
  - Fallback to filename ONLY if `common.title` is missing.
  - **Best-Effort Mode**: If metadata parsing fails, log a warning and continue ingest using filename + duration fallback. Do not block the import or show a fatal error toast.
  - Do not change the database schema version for this task.

## 3. Tests
- **Target**: `apps/lite/src/lib/files/__tests__/ingest.test.ts`.
- **Action**: Add cases for:
  - Metadata title is used when present.
  - Filename fallback when title is missing.
  - Duration fallback path when metadata duration is absent.

## 4. Verification
- **Test**: Drag a properly tagged MP3 (with ID3 artwork).
- **Check**: Verify the artwork and album name are correctly displayed in the Files list.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx` (Metadata section).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
