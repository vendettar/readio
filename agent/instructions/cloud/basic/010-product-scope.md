# Product Scope

Readio Cloud is a web application for audio playback, podcast discovery, local audio management, transcripts, and language-learning reading flows.

## Current product surface

- `apps/cloud-ui` is the active React/Vite frontend for playback, discovery, library, files, downloads, settings, and transcript reading.
- `apps/cloud-api` is the active Go backend for runtime config, discovery relay, PodcastIndex-backed routes, ASR relay, media proxy fallback, SQLite persistence, and observability.
- `apps/docs` is the project documentation site and must reflect current code, not old prototype phases.
- `apps/native` remains a scaffold only; do not document native behavior as implemented.

## Implemented user capabilities

- Discover podcasts and episodes through Explore, Search, show, episodes, and episode-detail pages.
- Play remote podcast audio and browser-local audio files.
- Keep browser-local favorites, history, subscriptions, settings, downloads, local files, and local transcript artifacts.
- Download episodes and manage subtitle/transcript versions.
- Read transcripts with word/selection interactions and dictionary lookup behavior.
- Generate or reuse transcripts through the configured ASR flow where supported.

## Non-goals for the current prototype

- No server-backed user account library, sync, or multi-user SaaS contract.
- No claim that all audio bytes route through the backend.
- No generic outbound fetch service exposed to browsers.
- No server-side storage of user ASR provider credentials.
- No native mobile feature contract beyond the placeholder directory.
