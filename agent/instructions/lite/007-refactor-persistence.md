> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx`, `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`, and `agent/instructions/lite/006-standardize-db-ids.md` before starting.

# Task: Refactor Persistence Logic (Single Source of Truth) [COMPLETED]

## Objective
The current codebase suffered from "Dual-Write" issues where both `useFileHandler` and `playerStore` attempted to write to IndexedDB.
We consolidated all persistence logic into the Store Actions.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Audit & Fix `apps/lite/src/hooks/useFileHandler.ts` ✅
- **Issue**: `useFileHandler` called `DB.addAudioBlob` directly.
- **Fix Applied**:
  - Removed ALL `DB` calls from `useFileHandler.ts`.
  - It now ONLY calls `store.loadAudio(file)` and `store.loadSubtitles(file)`.
  - Added file type validation helpers (`isAudioFile`, `isSubtitleFile`).
  - The `store.loadAudio` action handles: blob URL creation, DB persistence, session linking.
  - Removed `pendingAudioRef`, `pendingSubtitleRef`, and `createOrUpdateSession` (no longer needed).

## 2. Audit `apps/lite/src/hooks/useSession.ts` ✅
- **Issue**: `saveProgress` relied on `lastSaveRef` inside a Hook (Stale Closure risk).
- **Fix Applied**:
  - Moved the throttled save logic into `playerStore.ts`.
  - Created new action `store.updateProgress(time)` that updates state AND throttles the DB write internally.
  - Created new action `store.saveProgressNow()` for immediate save on unmount.
  - The throttling state is module-level (`lastProgressSaveTime`) to avoid closure issues.
  - `useSession` now exposes `updateProgress` instead of `saveProgress`.
  - Removed `lastSaveRef` from useSession.

## 3. Audit `apps/lite/src/store/playerStore.ts` ✅
- **Issue**: `loadAudio` does "Fire-and-forget" saving.
- **Status**: Kept as-is with error logging. The fire-and-forget pattern is acceptable for UI responsiveness.
- **New Actions Added**:
  - `updateProgress(time: number)`: Updates store state AND throttles DB writes (5 second interval).
  - `saveProgressNow()`: Forces immediate DB save (for unmount scenarios).

## 4. Root Component Update ✅
- **Updated**: `src/routes/__root.tsx` now uses `updateProgress` instead of `setProgress` for audio `timeupdate` events.
- This ensures all progress updates go through the throttled persistence path.

## 5. Verification ✅
- **Test**: Drag and drop a file.
- **Check**: Look at Network/IndexedDB tab. Ensure only **ONE** write operation happens.
- **Check**: Ensure `sessionId` is created correctly.
- **Note**: If any Dexie schema changes were required, follow the reset policy in handoff docs.
- **Build**: `pnpm --filter @readio/lite build` ✅
- **Type Check**: `pnpm --filter @readio/lite exec tsc --noEmit` ✅
- **Lint**: `pnpm --filter @readio/lite exec biome check .` ✅
- **Tests**: All 116 tests pass ✅

### Architecture After Refactor
```
┌─────────────────────────────────────────────────────────────┐
│                       User Action                            │
│  (Drag & Drop File / Select File / Audio Timeupdate)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     useFileHandler.ts                        │
│  - Validates file type                                       │
│  - Delegates to store.loadAudio() / store.loadSubtitles()    │
│  - NO direct DB calls                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      playerStore.ts                          │
│  - loadAudio: Creates blob URL, saves to DB, updates state   │
│  - loadSubtitles: Parses SRT, saves to DB, updates state     │
│  - updateProgress: Updates state + throttled DB write        │
│  - saveProgressNow: Immediate DB write (unmount)             │
│  *** SINGLE SOURCE OF TRUTH FOR PERSISTENCE ***              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        dexieDb.ts                            │
│  - addAudioBlob, addSubtitle                                 │
│  - createPlaybackSession, updatePlaybackSession              │
└─────────────────────────────────────────────────────────────┘
```

---
## Documentation
- Updated `apps/docs/content/docs/apps/lite/handoff/index.mdx` with completion status.
- Updated `apps/docs/content/docs/general/technical-roadmap.mdx` with completion status.

## Completion
- **Completed by**: Readio Worker (Coder)
- **Files Modified**:
  - `apps/lite/src/hooks/useFileHandler.ts` (removed all DB calls)
  - `apps/lite/src/hooks/useSession.ts` (removed saveProgress, use store actions)
  - `apps/lite/src/store/playerStore.ts` (added updateProgress, saveProgressNow)
  - `apps/lite/src/routes/__root.tsx` (use updateProgress)
  - `apps/lite/src/__tests__/useFileHandler.test.ts` (updated tests)
  - `apps/lite/src/__tests__/useSession.test.ts` (updated tests)
- **Verification**:
  - `pnpm --filter @readio/lite build`
  - `pnpm --filter @readio/lite exec tsc --noEmit`
  - `pnpm --filter @readio/lite exec biome check .`
  - `pnpm --filter @readio/lite test run`
- **Date**: 2026-01-20
