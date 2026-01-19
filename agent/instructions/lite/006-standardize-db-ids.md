> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Standardize DB Primary Keys (UUID) [COMPLETED]

## Objective
Convert all auto-incrementing integer IDs and natural string IDs to UUID strings. This ensures global uniqueness and prepares the app for Cloud Sync.

## 1. Update Dexie Schema (`apps/lite/src/lib/dexieDb.ts`)
- **Action**: Change primary keys for the following tables:
  - `folders`: `++id` -> `id` (UUID string)
  - `local_tracks`: `++id` -> `id` (UUID string)
  - `local_subtitles`: `++id` -> `id` (UUID string)
  - `subscriptions`: `feedUrl` -> `id` (UUID string, with `&feedUrl` as a unique index for de-duplication).
  - `favorites`: `key` -> `id` (UUID string, with `&key` as unique index).
- **Interfaces**: All `id` fields are now `string`.

### Migration Matrix (Updated)
| Store | New PK | Unique Indexes | Identity vs Dedupe |
|---|---|---|---|
| `folders` | `id` (UUID) | `createdAt` | Identity = `id` |
| `local_tracks` | `id` (UUID) | `folderId`, `createdAt` | Identity = `id` |
| `local_subtitles` | `id` (UUID) | `trackId` | Identity = `id` |
| `subscriptions` | `id` (UUID) | `&feedUrl` | Identity = `id`, Dedupe = `feedUrl` |
| `favorites` | `id` (UUID) | `&key` | Identity = `id`, Dedupe = `key` |

## 2. Refactor Store Logic
- **Targets Updated**:
  - `exploreStore.ts`: Updated `subscribe`/`unsubscribe`/`addFavorite`/`removeFavorite` to use new API.
  - `playerStore.ts`: Updated `localTrackId` type from `number` to `string`.
  - `useFilesData.ts`: Updated `folderId` and `folderCounts` types.
  - `useFileProcessing.ts`: Updated `folderId` and `trackId` types.
  - `useFileDragDrop.ts`: Updated `trackId` and `folderId` types.
  - `useFilePlayback.ts`: Updated `trackId` and `subtitleId` types.
  - `useFolderManagement.ts`: Updated `folderId` type.

## 3. Component Updates
- **TrackCard.tsx**: Updated prop types for IDs (string instead of number).
- **TrackOverflowMenu.tsx**: Updated prop types for folderId (string instead of number).
- **FilesFolderPage.tsx**: Updated to use string folderId from route params directly.
- **FilesIndexPage.tsx**: Updated to use string IDs.

## 4. ID Generation
- **Requirement**: Use `createId()` from `apps/lite/src/lib/id.ts` for every insertion.
- **Implementation**: `dexieDb.ts` now imports and uses `createId()`.

## 5. Forced Data Reset
- **Action**: Per "First Release" policy, a database reset is required.
- **Rule**: Use `DB.clearAllData()` to wipe existing data after this migration.

## 6. Verify
- **Check**: Build passes (`pnpm build`). ✅
- **Check**: Type check passes (`pnpm --filter @readio/lite exec tsc --noEmit`). ✅
- **Check**: Lint passes (`pnpm --filter @readio/lite exec biome check .`). ✅

---
## Documentation
- Updated `apps/docs/content/docs/apps/lite/handoff/index.mdx` with completion status.
- Updated `apps/docs/content/docs/general/technical-roadmap.mdx` with completion status.

## Completion
- **Completed by**: Readio Worker (Coder)
- **Files Modified**:
  - `apps/lite/src/lib/dexieDb.ts` (interfaces, schema, CRUD methods)
  - `apps/lite/src/store/exploreStore.ts`
  - `apps/lite/src/store/playerStore.ts`
  - `apps/lite/src/hooks/useFilesData.ts`
  - `apps/lite/src/hooks/useFileProcessing.ts`
  - `apps/lite/src/hooks/useFileDragDrop.ts`
  - `apps/lite/src/hooks/useFilePlayback.ts`
  - `apps/lite/src/hooks/useFolderManagement.ts`
  - `apps/lite/src/components/Files/TrackCard.tsx`
  - `apps/lite/src/components/Files/TrackOverflowMenu.tsx`
  - `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`
  - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
  - `apps/lite/src/lib/files/ingest.ts`
  - `apps/lite/src/lib/files/__tests__/sortFolders.test.ts`
  - `apps/lite/src/lib/files/__tests__/ingest.test.ts`
- **Verification**:
  - `pnpm --filter @readio/lite build`
  - `pnpm --filter @readio/lite exec tsc --noEmit`
  - `pnpm --filter @readio/lite exec biome check .`
- **Date**: 2026-01-19
- **Reviewed by**: Readio Reviewer (QA)
