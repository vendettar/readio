> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx` before starting.

# Task: Visualize Offline Content Management

## Objective
Provide clarity on which content is stored locally and allow users to manage their device storage.

## 1. Offline Indicator
- **Target**: `apps/lite/src/components/Explore/EpisodeRow.tsx` and `PodcastCard.tsx`.
- **Action**: Add a small "Downloaded" or "Offline" icon (e.g., `CheckCircle` or `CloudDownload` from Lucide) if the track exists in `audioBlobs`.
 - **Rule**: Do NOT infer offline state from `feedUrl` alone; only show if a local blob exists.

## 2. Storage Cleanup Tool
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx` (or `FilesPage`).
- **Feature**: A "Cleanup" button that identifies tracks not played in the last 30 days and offers to remove their Blobs (keeping metadata).
- **I18n**: Labels for storage usage and cleanup confirmation.
 - **Safety**: Require `ConfirmAlertDialog` before deletion and show total size to be removed.

## 3. Verification
- **Test**: Download a podcast (save to `audioBlobs`).
- **Check**: Verify the icon appears next to the episode title.
- **Test**: Run cleanup. Verify old Blobs are removed but the track remains in the list.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx` (Cleanup policies).
- Update `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`.
- Update `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D016 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
