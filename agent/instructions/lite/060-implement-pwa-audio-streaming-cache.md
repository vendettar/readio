> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` and `apps/docs/content/docs/apps/lite/performance.mdx` before starting.

# Task: Implement PWA Audio Streaming Cache

## Objective
Enable offline seeking for large audio files by supporting HTTP Range Requests (206 Partial Content) in the Service Worker.

## 1. Configure Workbox / Service Worker
- **Action**: Update the Service Worker configuration (using Vite PWA plugin or Workbox).
- **Implementation**: Add a specific cache strategy for media files (`.mp3`, `.m4a`, etc.).
- **Requirement**: Use `workbox-range-requests` plugin to handle slicing audio data from the cache.
 - **Rule**: Respect Range Requests and return `206 Partial Content` when requested.

## 2. Media Cache Persistence
- **Action**: Define a dedicated cache named `readio-media-v1`.
- **Strategy**: Cache-first for local blobs, and stale-while-revalidate for remote streams.
- **Constraint**: Do NOT cache cross-origin responses without proper CORS headers.

## 3. Verification
- **Test**: Download an episode. Go offline.
- **Check**: Play the episode and attempt to skip to the middle. It should seek instantly without error.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (PWA caching section).
- Update `apps/docs/content/docs/apps/lite/performance.mdx` (Range request behavior).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D023 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
