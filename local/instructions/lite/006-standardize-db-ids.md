> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

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

## 2. Refactor Store Logic
- **Target**: `exploreStore.ts`, `playerStore.ts`, `useFilesData.ts`.
- **Change**:
  - Replace any logic that relies on `feedUrl` as the "Identity" of a podcast with the new `id`.
  - **De-duplication**: When adding a subscription, you MUST check if `feedUrl` already exists using the index.
  - **Identity**: `currentPodcast` should be tracked by `id`.

## 3. ID Generation
- **Requirement**: Use `createId()` from `apps/lite/src/lib/id.ts` for every insertion.

## 4. Forced Data Reset
- **Action**: Per "First Release" policy, increment the DB name suffix (e.g. `readio_v2`) to wipe legacy data cleanly.

## 5. Verify
- **Check**: Build passes (`pnpm build`).
- **Check**: Multiple subscriptions with different URLs work.
- **Check**: Adding the same URL twice fails (Unique Constraint).

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
