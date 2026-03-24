> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`, `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx`, and `apps/docs/content/docs/general/security.mdx` before starting.

# Task: Integrate Robust Metadata Parser

## Objective
Replace "hand-rolled" filename parsing with a professional binary stream parser to extract high-quality metadata (Cover, Album, Artist, Duration) from local files.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Install Library
- **Action**: `pnpm --filter @readio/lite add music-metadata`.
- **Reason**: This is the industry standard for browser-based audio metadata extraction.

## 2. Refactor Ingestion Logic
- **Target**: `apps/lite/src/lib/files/ingest.ts`.
- **Action**: Update the metadata extraction step using a **Web Worker**.
- **Logic**:
  - **Worker Default**: Implement the parser in `apps/lite/src/workers/metadata.worker.ts` and call it from ingestion.
  - Use `parseBlob(file)` from `music-metadata` inside the Worker to avoid blocking the main thread.
  - Prefer `common.picture` for artwork, but return/store it as a `Blob` only (do not create ObjectURLs in the Worker).
  - Extract `common.title`, `common.album`, `common.artist` from metadata.
  - Prefer `format.duration` if provided; fall back to `getAudioDuration` only when metadata lacks duration.
  - Fallback to filename ONLY if `common.title` is missing.
  - **Best-Effort Mode**: If metadata parsing fails, log a warning in DEV only and continue ingest using filename + duration fallback. Do not block the import or show a fatal error toast.
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
- Update `apps/docs/content/docs/general/decision-log.mdx` D032 to reflect worker implementation.

---

## ✅ COMPLETION SUMMARY

### Implementation Completed

1. **Worker Implementation** (`src/workers/metadata.worker.ts`):
   - Created dedicated Web Worker for metadata parsing
   - Extracts: title, album, artist, duration, artworkBlob
   - Implements JPEG EOI repair for malformed embedded images
   - Enhanced artwork extraction with front cover prioritization

2. **Database Schema** (`src/lib/db/types.ts`):
   - Added `album?: string` to FileTrack interface
   - Added `artist?: string` to FileTrack interface

3. **Ingestion Pipeline** (`src/lib/files/ingest.ts`):
   - Worker integration via `parseMetadataInWorker()`
   - Captures album/artist alongside title/duration
   - Passes metadata to `DB.addFileTrack()` for storage

4. **UI Display** (`src/components/Files/TrackCard.tsx`):
   - Album/artist displayed below track name
   - Uses muted text styling for subtle appearance
   - Bullet separator (•) when both artist and album present
   - Gracefully hidden when metadata is missing

5. **Documentation Updates**:
   - Decision Log D032: Updated to reflect worker-based implementation
   - Both EN/ZH versions aligned
   - Worker path documented (`src/workers/metadata.worker.ts`)

### Verification Results
```bash
✅ pnpm --filter @readio/lite typecheck → PASS
✅ pnpm --filter @readio/lite lint → PASS
✅ All ingest tests passing (7/7)
✅ UI displays album/artist when available
```

### Data Flow
```
User imports MP3
  → Worker extracts ID3 tags (title, album, artist, artwork, duration)
  → ingest.ts captures metadata
  → DB.addFileTrack stores in IndexedDB
  → TrackCard displays album/artist below track name
```

### Visual Design
```
[Track Name]
Artist • Album          ← NEW: muted text, xs size
Last played · 2h ago    ← Existing feature
```

## Patch Additions (Integrated)
# Patch: 069-integrate-robust-metadata-parser

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
- Worker error handling + fallback without crash.
