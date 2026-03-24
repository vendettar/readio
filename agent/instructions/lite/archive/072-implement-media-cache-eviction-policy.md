> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/database.mdx` and `apps/docs/content/docs/apps/lite/performance.mdx` before starting.

# Task: Implement Media Cache Eviction Policy

## Objective
Prevent the application from consuming all device storage by automatically removing old audio cache files based on usage and size limits.

## 1. Define Eviction Logic
- **Path**: `apps/lite/src/lib/cacheEviction.ts`.
- **Policy**:
  - Max Cache Size: configurable via runtime config `READIO_AUDIO_CACHE_MAX_MB` (default **1024**).
  - Trim Target: configurable via runtime config `READIO_AUDIO_CACHE_TRIM_TARGET_MB` (default **800**).
  - Constraint: `TRIM_TARGET_MB` must be **<** `MAX_MB`, otherwise fallback to defaults.
  - Strategy: **LRU (Least Recently Used)** using `lastAccessedAt`.
- **Implementation**:
  - Track `lastAccessedAt` on audio blobs when played or loaded.
  - When new audio is ingested, check total size of `audioBlobs`. If over the max, delete least-recently-used blobs until under the trim target.
  - Do not change the database schema version for this task.
  - Add both runtime config keys to `public/env.js` and `src/lib/runtimeConfig.ts` schema.

## 2. Background Task
- **Action (Default)**: Run the eviction check at boot and schedule an additional idle-time check.
- **Idle Fallback**: If `requestIdleCallback` is unavailable, fall back to `setTimeout` (e.g., 2s).

## 3. Retention Flag
- **Feature**: Allow users to "Pin" certain files to prevent them from being evicted (use `pinnedAt` on `local_tracks`).
- **Pin Policy**: Pinned items are never evicted. Set `pinnedAt = Date.now()` when pinned and `null` when unpinned.

## 4. Verification
- **Test**: Manually populate `audioBlobs` with 1.2GB of dummy data.
- **Check**: Trigger the check and verify that only the most recent files remain and total size is under 1GB.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (Retention policy section).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
