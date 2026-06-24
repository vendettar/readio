# Data, Media, Transcript, and ASR Contract

Readio Cloud splits data ownership between browser-local artifacts and backend-owned service metadata.

## Browser-local data

The frontend owns local files, folders, downloads, local transcript artifacts, favorites, history, subscriptions, playback session state, settings, credentials stored in browser-local storage, and runtime caches that are explicitly browser-owned. Clearing browser/site data removes these artifacts.

## Backend-owned data

The backend owns SQLite metadata for service-governed features: PodcastIndex retained snapshots, cache state, admin/observability support where implemented, and shared podcast transcript asset metadata. Backend storage does not imply user account sync.

## Media transport

- Remote playback is browser-direct first.
- Backend fallback is a narrow same-origin path for approved media failure classes and must remain pass-through and non-caching.
- Local `blob:` playback must stay browser-only and must never be proxied.
- Download and transcript fetch flows may use the existing fallback transport only when the failure class is transport-related; parsing failures must remain separate.
- Fallback requests must keep target validation, redirect safety, request bounds, rate limits, structured logging, and origin checks.

## Transcripts and subtitles

- Transcript-first playback should reuse available transcript sources before triggering ASR.
- Subtitle/transcript versions must preserve source identity and expose deterministic selection/deletion behavior.
- Local/downloaded subtitle artifacts remain browser-owned unless a backend shared transcript asset contract explicitly applies.
- Backend shared transcript assets are eligible podcast artifacts only; their canonical cue payload is deployment-owned storage, not browser cache.

## ASR

- Provider transcription submission is routed through the backend relay when configured for Cloud.
- Provider credentials remain user-owned and browser-supplied per request; the backend must not persist them as user credentials.
- Provider verification/readiness may remain browser-direct where documented by the current runtime contract.
- Provider enable/disable toggles must fail closed and be reflected consistently in settings, runtime config, and ASR execution paths.
- Chunking, request limits, cancellation, and memory guards must protect both frontend and backend paths.

## Language-learning behavior

- Transcript tokenization should be locale-aware and use `Intl.Segmenter` where available.
- Dictionary lookup should use runtime-configured dictionary endpoints and language fallback semantics.
- Playback pause/reading interactions must be intentional and accessible rather than implicit side effects.
