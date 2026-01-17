> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Standardize DB Primary Keys (UUID)

## Objective
Convert all auto-incrementing integer IDs and natural string IDs to UUID strings. This ensures global uniqueness and prepares the app for Cloud Sync.

## 1. Update Dexie Schema (`apps/lite/src/lib/dexieDb.ts`)
- **Action**: Change primary keys for the following tables:
  - `folders`: `++id` -> `id`
  - `local_tracks`: `++id` -> `id`
  - `local_subtitles`: `++id` -> `id`
  - `subscriptions`: `feedUrl` -> `id` (and add `&feedUrl` as a unique index for de-duplication).
  - `favorites`: `key` -> `id` (and add `&key` as unique index).
- **Interfaces**: All `id` fields must be `string`.

### Migration Matrix (Must Update)
| Store | New PK | Unique Indexes | Identity vs Dedupe |
|---|---|---|---|
| `folders` | `id` (UUID) | `createdAt` (if needed) | Identity = `id` |
| `local_tracks` | `id` (UUID) | `folderId`, `createdAt` | Identity = `id` |
| `local_subtitles` | `id` (UUID) | `trackId` | Identity = `id` |
| `subscriptions` | `id` (UUID) | `&feedUrl` | Identity = `id`, Dedupe = `feedUrl` |
| `favorites` | `id` (UUID) | `&key` | Identity = `id`, Dedupe = `key` |

## 2. Refactor Store Logic
- **Target**: `exploreStore.ts`, `playerStore.ts`, `useFilesData.ts`.
- **Change**:
  - Replace any logic that relies on `feedUrl` as the "Identity" of a podcast with the new `id`.
  - **De-duplication**: When adding a subscription, you MUST check if `feedUrl` already exists using the index.
  - **Identity**: `currentPodcast` should be tracked by `id`.
  - **Keying**: UI list keys and route params must use `id` (never `feedUrl`).

## 3. ID Generation
- **Requirement**: Use `createId()` from `apps/lite/src/lib/id.ts` for every insertion.

## 4. Forced Data Reset
- **Action**: Per "First Release" policy, allow a one-time clean reset.
- **Rule**: Do not bake a new default DB name into source. Use `READIO_DB_NAME` override or explicit `clearAllData()` to wipe during development.

## 5. Verify
- **Check**: Build passes (`pnpm build`).
- **Check**: Multiple subscriptions with different URLs work.
- **Check**: Adding the same URL twice fails (Unique Constraint).
 - **Check**: All tables contain UUID primary keys (no auto-increment left).

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
