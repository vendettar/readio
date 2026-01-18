> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx`, `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`, and `agent/instructions/lite/006-standardize-db-ids.md` before starting.

# Task: Refactor Persistence Logic (Single Source of Truth)

## Objective
The current codebase suffers from "Dual-Write" issues where both `useFileHandler` and `playerStore` attempt to write to IndexedDB.
We must consolidate all persistence logic into the Store Actions.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Audit & Fix `apps/lite/src/hooks/useFileHandler.ts`
- **Issue**: `useFileHandler` calls `DB.addAudioBlob` directly.
- **Fix**:
  - Remove all `DB` calls from `useFileHandler.ts`.
  - It should ONLY call `store.loadAudio(file)`.
  - **Validation**: Before calling store, validate the file using Zod (check `apps/lite/src/lib/schemas/*` for existing schemas or create a new one for File validation).
  - The `store.loadAudio` action is already responsible for saving to DB (we verified this in `playerStore.ts`).

## 2. Audit `apps/lite/src/hooks/useSession.ts`
- **Issue**: `saveProgress` relies on `lastSaveRef` inside a Hook (Stale Closure risk).
- **Fix**:
  - Move the throttled save logic into `playerStore.ts`.
  - Create a new action `store.updateProgress(time)` that updates state AND throttles the DB write internally.
  - The hook should just call `store.updateProgress(time)`.

## 3. Audit `apps/lite/src/store/playerStore.ts`
- **Issue**: `loadAudio` does "Fire-and-forget" saving.
- **Fix**:
  - Ensure `loadAudio` handles errors gracefully (toast.error inside store is acceptable for now, or return error state).
  - Ensure it checks for duplicates before writing (if not already done in DB layer).

## 4. Verification
- **Test**: Drag and drop a file.
- **Check**: Look at Network/IndexedDB tab. Ensure only **ONE** write operation happens.
- **Check**: Ensure `sessionId` is created correctly.
- **Note**: If any Dexie schema changes were required, follow the reset policy in handoff docs.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
