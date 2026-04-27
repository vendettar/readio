---
title: Cloud Media Fallback Audit
---

# Cloud Media Fallback Audit

## Scope
This audit uses Lite's current media handling as the baseline contract and classifies the Cloud media surfaces that still vary by upstream host or request type.

It distinguishes:

- native `<audio src=...>` transport
- JS `fetch` transport
- `HEAD`
- plain `GET`
- `Range GET`
- local `blob:` playback
- tracking URL unwrap preprocessing

## 8-Scope Scan

- Config: Cloud still has `CORS_PROXY_*` plumbing in runtime config and settings schemas, but the Cloud Settings page no longer renders the proxy section. Risk: dormant proxy configuration can be mistaken for an approved UI contract.
- Persistence: local downloads, transcripts, and playback state remain browser-local in IndexedDB / storage. Risk: backend fallback must not introduce server persistence or hidden cache state.
- Routing: Cloud playback still routes through the same player shell and `audioUrl` flow; Cloud Settings omits the `CORS Proxy` block. Risk: startup fallback must not change route topology.
- Logging: `fetchUtils` records direct/proxy attempts and timeout outcomes; download/transcript paths already have failure logging. Risk: later fallback paths need request-class labels so repeated media failures are diagnosable.
- Network: `fetchWithFallback` still owns the JS fetch fallback lanes; foreground prefetch still does direct `fetch` with `Range`; native audio now gets a single same-origin proxied-URL retry after a direct media-element failure, and that retry is intentionally limited to the built-in same-origin `/api/proxy` route. Risk: over-broad retry logic would proxy requests that already work, imply support for authenticated external proxies that native audio cannot use, or loop on repeated playback failures.
- Storage: blob playback is backed by local object URLs; prefetch state is in-memory only; transcript cache is local DB plus in-memory cache. Risk: do not move media bytes into backend storage.
- UI state: `GlobalAudioController` uses `mediaReadySrc`, `pendingSeek`, and latest-request-wins behavior. Risk: stale async completions can attach fallback responses to the wrong source if retries are not guarded.
- Tests: current coverage exists for `fetchUtils`, `downloadService`, `remoteTranscript`, `urlUtils`, `audioPrefetch`, `playbackSource`, and Settings. Risk: media fallback needs deterministic tests, not only live-host smoke checks.

## Classification Matrix

| Request class | Request initiator | Lite behavior | Current Cloud behavior | `fetchWithFallback` involved | User-configured proxy fallback today | Cloud backend fallback should exist | Safe fallback trigger | Reasons not to fallback |
|---|---|---|---|---|---|---|---|---|
| Primary remote audio playback through native `<audio>` | `useAudioElementSync` via `GlobalAudioController` sets `audio.src` | Browser-direct media-element load; `blob:` when local download exists | Browser-direct first, then one same-origin proxied-URL retry if the direct media-element load errors | No | Not user-configurable in Cloud; fallback uses only the built-in same-origin proxy route | Yes, but only as an explicit proxied media URL retry, not a generic JS fetch fallback | Direct native audio error on the current track before a proxy retry has already been attempted | Native audio transport is not a JS retry target; retries must stay bounded to one proxied URL attempt per track, must not claim support for authenticated external proxies, and must not introduce backend caching |
| Foreground audio prefetch using JS `fetch` with `Range` | `useForegroundAudioPrefetch` -> `AudioPrefetchScheduler` | Direct `fetch` with `Range`; no proxy fallback | Same as Lite | No | No visible Cloud UI proxy; no active user-facing proxy config | Yes, but only for approved browser/CORS/network failures and only for this request class | Direct `fetch` fails with CORS/network failure or the upstream does not support the partial-content request | Prefetch is an optimization; it should not force all playback bytes through the backend |
| Download sizing via `HEAD` | `downloadService.executeDownload` | `fetchWithFallback` direct-first, then proxy if configured | Same code path; Cloud UI hides the proxy section, but the plumbing still exists in config/state | Yes | Not user-visible in Cloud, but dormant config plumbing remains | Yes | Direct request fails with network/CORS/timeout or upstream 5xx after the direct attempt | None, beyond preserving body cancellation and not caching |
| Download transfer via `GET` | `downloadService.executeDownload` | `fetchWithFallback` direct-first, then proxy if configured; stream to IndexedDB | Same code path as Lite | Yes | Not user-visible in Cloud, but dormant config plumbing remains | Yes | Direct request fails with network/CORS/timeout or upstream 5xx after the direct attempt | Do not add server-side media persistence or caching |
| Remote transcript fetch | `fetchAndPersistRemoteTranscript` via `fetchTextWithFallback` | Direct-first text fetch with proxy fallback; transcript cached locally after fetch | Same code path as Lite | Yes | Not user-visible in Cloud, but dormant config plumbing remains | Yes | Direct request fails with network/CORS/timeout or upstream 5xx after the direct attempt | Do not collapse parse failures into transport failures; keep parsing isolated |
| Media fetches triggered during playback startup | `remotePlayback` delegates into `downloadEpisode` / `fetchRemoteAudioBlob` when the startup path needs media bytes | Startup itself is mostly source resolution; any actual media fetch inherits the download/transcript behavior | Same as Lite | Sometimes, depending on the startup branch | Same as the delegated class | Yes, but only through the delegated request class; startup itself is not a new transport | The delegated branch's fallback trigger | Plain source resolution that does not fetch bytes should stay browser-local |
| Local `blob:` playback | `playbackSource.resolvePlaybackSource` | Browser-local object URL from IndexedDB download | Same as Lite | No | No | No | None | Must remain browser-only and never be proxied |
| Tracking URL unwrap paths | `unwrapPodcastTrackingUrl` in `playbackSource`, `downloadService`, `remoteTranscript` | Canonicalization only; no network by itself | Same as Lite | No | No | Preserve as preprocessing only | Not a transport fallback trigger | Unwrapping is not a network request; it feeds the later request classes and must stay deterministic |

## Risk Notes

- Duplicate fallback retries: if direct failure is re-tried too broadly, the same episode can generate repeated proxy traffic for the same source and request class.
- Stale async completions during source switches: fallback responses must not attach to a newer track after a user skips or changes source.
- Playback startup re-entrancy: startup branches that trigger download or transcript work must preserve latest-request-wins behavior and not block the player on redundant work.
- Prefetch/download overlap: foreground `Range` prefetch, sizing `HEAD`, and download `GET` are distinct; one failure class must not spill into the others.

## Test Targets For Later Child Instructions

- `apps/cloud-ui/src/lib/__tests__/audioPrefetch.test.ts`
- `apps/lite/src/lib/__tests__/audioPrefetch.test.ts`
- `apps/cloud-ui/src/lib/__tests__/fetchUtils.test.ts`
- `apps/lite/src/lib/__tests__/fetchUtils.test.ts`
- `apps/cloud-ui/src/lib/__tests__/downloadService.regression.test.ts`
- `apps/lite/src/lib/__tests__/downloadService.regression.test.ts`
- `apps/cloud-ui/src/lib/__tests__/remoteTranscript.test.ts`
- `apps/lite/src/lib/__tests__/remoteTranscript.test.ts`
- `apps/cloud-ui/src/lib/player/__tests__/playbackSource.test.ts`
- `apps/cloud-ui/src/lib/player/__tests__/remotePlayback.test.ts`
- `apps/cloud-api` handler tests for media proxy `Range`, `206`, `416`, timeout, and redirect behavior

## Audit Summary

- Browser-direct stays first-choice for native audio and local blob playback.
- Native audio fallback is now limited to one explicit same-origin proxied URL retry per track.
- Backend fallback is justified for JS `fetch`-based media-adjacent flows that are exposed to CORS/network failures.
- The Cloud backend should not be used as a blanket media relay in this phase.
- Tracking URL unwrap must remain preprocessing, not transport fallback.
- The Cloud UI currently does not expose the proxy section in Settings, even though the underlying config plumbing still exists.
