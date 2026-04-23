---
title: Cloud ASR Relay Audit
---

# Cloud ASR Relay Audit

## Scope
This audit records the Cloud ASR transport split that motivated the relay work, and the resulting runtime contract after the provider relay cutover.

It separates:

- media fetch fallback
- provider transcription submission
- provider verification / readiness checks
- local blob and downloaded-blob input preparation

## 8-Scope Scan

- Config: Cloud still has browser-side ASR provider registry/config plumbing and hidden settings-driven provider selection. Risk: transport ownership and key ownership can be conflated unless the backend relay contract is explicit.
- Persistence: ASR transcripts and local downloads remain browser-local in IndexedDB / download tables. Risk: relay implementation must not introduce server persistence or hidden transcript cache state.
- Routing: ASR flow still routes through `remoteTranscript` and the queued playback/transcribe pipeline. Risk: a relay cutover must preserve latest-request-wins and track-switch boundaries.
- Logging: provider-specific code logs chunking, retries, and provider errors. Risk: relay logging must avoid leaking API keys or request bodies.
- Network: provider transcription submission now uses a dedicated same-origin relay; media-source fetches still use the Cloud backend fallback classes where approved. Risk: provider verification/readiness remains browser-direct and can still hit provider-origin CORS until a later instruction changes that scope.
- Storage: ASR input blobs are built from browser-local audio/blob sources before transcription. Risk: relay must accept bounded uploads without moving local media storage server-side.
- UI state: transcript ingestion uses `asrActiveTrackKey`, `abortAsrController`, and `isTrackStillCurrent`. Risk: a late relay response must not overwrite the active track.
- Tests: current coverage exists for `remoteTranscript`, `remoteTranscript.retranscribe`, `asr` provider behavior, and fallback helpers. Risk: provider relay needs deterministic routing tests, not only media fallback tests.

Adjacent risk notes:

- provider secret exposure
- large multipart upload size
- duplicate transcription submission
- stale completion after track switch
- client/server retry interaction

## Classification Matrix

| Request class | Request initiator | Current Cloud ownership | Browser direct still used | `fetchWithFallback` involved | User-configured proxy fallback today | `/api/proxy` involved | Same-origin relay ownership required | Failure classes that must remain terminal | Non-goals / reasons not to cut over |
|---|---|---|---|---|---|---|---|---|---|
| Remote audio fetch used as ASR input | `fetchRemoteAudioBlob` in `remoteTranscript.ts` | Cloud media fallback class `ASR_AUDIO` | Yes, direct first | Yes | No | Yes, on fallback | No. Existing media fallback through `/api/proxy` is sufficient for this class | Invalid local blob state, stale track switch, explicit abort | This is media-fetch fallback, not provider submission. Do not move it into a new ASR relay. |
| Remote transcript fetch used for transcript recovery | `fetchTextWithFallback` in `remoteTranscript.ts` | Cloud media fallback class `TRANSCRIPT` | Yes, direct first | Yes | No | Yes, on fallback | No. Existing media fallback through `/api/proxy` is sufficient for this class | Malformed transcript content, stale track switch, explicit abort | This is recovery fetch, not provider transcription. Do not reclassify it as provider transport. |
| Provider transcription submission | `transcribeAudioWithRetry` -> `transcribeViaCloudRelay` -> `POST /api/v1/asr/transcriptions` | Dedicated same-origin provider relay | No | No | No | No | Yes, implemented | Missing provider config, unsupported provider/model, unauthorized, payload too large, rate limited, service unavailable, client abort | Do not extend `/api/proxy` into a generic multipart POST tunnel. Keep provider credentials transient, browser-supplied, and non-persistent in this phase. |
| Provider verification / readiness requests | `verifyOpenAiCompatibleKey`, `verifyQwenKey`, `verifyDeepgramKey`, `verifyVolcengineKey` | Browser-direct provider check; some providers already use user-proxy fallback plumbing via `fetchWithFallback` | Yes | Yes for OpenAI-compatible / Deepgram / Qwen; no for Volcengine | Yes, when dormant proxy plumbing exists in runtime config | No | Not required by the current relay cutover unless a later instruction explicitly expands the scope | Unauthorized, malformed provider key, unsupported provider, client abort | Keep this separated from transcription transport unless later product work proves it must move too. |
| Local `blob:` / downloaded blob / Dexie-backed blob ASR input | `fetchTrackAudioBlob`, local playback/download lookups | Browser-local input prep | No | No | No | No | No | Missing local blob, missing local track, stale completion | Must remain browser-local and never be proxied. |
| Tracking URL unwrap paths involved in ASR ingestion | `unwrapPodcastTrackingUrl` / `normalizeAsrAudioUrl` before fetch | Preprocessing only | No | No | No | No | No | None. This is not transport. | Do not turn URL normalization into a transport fallback trigger. |
| Abort / stale-track-switch boundaries across the ASR flow | `isTrackStillCurrent`, `inFlightAsrTasks`, `AbortController`, queued ASR tasks | UI state boundary | No | No | No | No | No | Stale completion, abort, latest-request-wins preservation | Do not let relay work or provider fallback bypass track identity checks. |

## Audit Summary

- Cloud media fetch fallback already covers the ASR-adjacent audio and transcript fetch classes.
- The provider-transcription CORS gap is now closed by the dedicated same-origin relay, not by `/api/proxy`.
- Provider verification/readiness is still browser-direct and must stay separated from transcription relay until a later instruction explicitly expands that scope.
- Local blob/downloaded-blob inputs remain browser-local and must not be moved into backend storage.
- Provider credentials remain user-owned and browser-supplied in this phase; the backend relay must treat them as transient request data only.

## Test Targets For Later Child Instructions

- `apps/cloud-ui/src/lib/__tests__/remoteTranscript.asr.test.ts`
- `apps/cloud-ui/src/lib/__tests__/remoteTranscript.localInputRelay.test.ts`
- `apps/cloud-ui/src/lib/asr/__tests__/backendRelay.test.ts`
- `apps/cloud-ui/src/lib/asr/__tests__/index.deepgram-routing.test.ts`
- `apps/cloud-ui/src/lib/asr/__tests__/index.providerToggleGuard.test.ts`
- `apps/cloud-api/asr_relay_test.go`
