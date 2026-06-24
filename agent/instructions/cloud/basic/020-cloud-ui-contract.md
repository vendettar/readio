# Cloud UI Contract

`apps/cloud-ui` is the only active web frontend. It is a React 19 + Vite + TypeScript application using TanStack Router, TanStack Query, Zustand, Dexie/IndexedDB, i18next, Radix UI, Tailwind, Vitest, and Playwright.

## Structure

- `src/routes` and `src/routeTree.gen.ts`: TanStack Router route definitions and generated route tree.
- `src/routeComponents`: page-level orchestrators for Explore, Search, Favorites, History, Downloads, Files, Settings, Subscriptions, and podcast pages.
- `src/components`: reusable UI modules, including AppShell, Player, Transcript, EpisodeRow, Files, Downloads, Selection, and GlobalSearch.
- `src/hooks`: shared UI/business hooks, including audio element handling, discovery hooks, file handling, settings, playback, and selection behavior.
- `src/lib`: platform services for runtime config, discovery clients, local persistence, download/transcript services, ASR, networking, player commands, text segmentation, and repositories.
- `src/store`: Zustand stores for playback, discovery/library state, settings, and UI state.

## Ownership rules

- TanStack Query owns remote/server-state caching.
- Zustand owns UI, playback, and library interaction state.
- Dexie repositories own browser-local persistence boundaries; UI code should use service/repository layers rather than direct table access.
- Route pages orchestrate; components render; hooks encapsulate cross-page behavior.
- High-frequency audio events remain isolated from broad React re-render paths.

## User-facing surfaces

- Explore/Search: discover public podcast metadata and episodes through backend-owned discovery routes.
- Podcast pages: resolve show metadata and episode lists through current Cloud discovery contracts.
- Player: supports mini/full surfaces, media session integration, sleep timer, playback history, and transcript-first reading modes.
- Files/Downloads: manage local files, episode downloads, subtitle versions, folders, and local playback.
- Settings: configure app language, region/content preferences, ASR provider options, storage/maintenance controls, and relevant runtime-visible options.
- Selection/Transcript: provide language-aware tokenization, keyboard/focus behavior, lookup, and reading controls.

## Frontend guardrails

- Route identity must use existing route builders and guards; do not reintroduce ad-hoc route string construction.
- Async flows must use request IDs, cancellation, or latest-wins guards where stale responses can overwrite current state.
- Local-only data must not be documented as recoverable from the backend.
- UI components should keep destructive actions explicit and accessible, with confirmation for irreversible local data deletion.
- Keep i18n resources type-checked and audited against the base English resource set.
