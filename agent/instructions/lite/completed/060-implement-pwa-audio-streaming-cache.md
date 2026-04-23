> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` and `apps/docs/content/docs/apps/lite/performance.mdx` before starting.

# Task: Implement PWA Audio Streaming Cache [COMPLETED]

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
## Completion Notes
- **Service Worker Config**: Updated `vite.config.ts` to change the audio caching strategy from `NetworkOnly` to `CacheFirst`.
- **Range Request Support**: Enabled `rangeRequests: true` in the Workbox configuration for media files. This automatically integrates the `workbox-range-requests` plugin, allowing the Service Worker to satisfy 206 Partial Content requests from the cache.
- **Cache Hardening**: 
  - Defined the dedicated cache name as `readio-media-v1`.
  - Restricted caching to status `200` to ensure only correct, CORS-enabled responses are stored.
  - Set expiration to 7 days with a limit of 50 entries.
- **Documentation**: 
  - Marked `D023` as implemented in `decision-log.mdx`.
  - Updated `environment.mdx` and `performance.mdx` with range request details.
- **Date**: 2024-05-20
- **Author**: Antigravity
- **Reviewed by**: CODEX

## Patch Additions (Integrated)
# Patch: 060-implement-pwa-audio-streaming-cache

## Why
Instruction 060 doesn’t define cache size limits, integration with quota monitoring (074), or fallback behavior when Range Requests aren’t supported. This can cause uncontrolled cache growth or broken playback in some browsers.

## Additions / Clarifications
- **Quota Integration**: Media cache size must respect the same quota thresholds defined in 074 (single source of truth). Do not exceed cap; surface user-facing warning when cap reached.
- **Feature Detection**: If `workbox-range-requests` or Range Requests are not supported, fallback to normal streaming without offline seeking (no crash).
- **Cache Scope**: Only cache same-origin or CORS-allowed responses; explicitly skip opaque responses.
- **Cache Eviction**: Define a max entries/size policy (LRU or TTL) to avoid unbounded growth.

## Verification (add)
- Test in Safari/Chrome that playback still works even if range handling is unsupported.
- Confirm cache size cap enforcement by exceeding the limit and observing fallback/warning.
