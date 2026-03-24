# Task: 116d (Patch) - Favorites Library URL Hygiene + Query Hint De-scope [COMPLETED]

## Goal
Make library-origin deep links (especially Favorites) follow the same canonical URL policy as History:
- URL should be path-only (`/$country/podcast/$id/episode/$episodeId`) without library query hints.
- Country authority remains route param only.
- Episode resolution remains deterministic via route params + shared slug/feed/provider logic.

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: no schema change and no backfill/migration.
- Routing: remove library query-hint dependency from link generation and propagation.
- Logging: keep explicit logs only for invalid library records (missing route requirements).
- Network: no endpoint changes.
- Storage: no cache schema change in this step.
- UI state: no `source=history|favorites|subscriptions` requirement for correctness.
- Tests: add URL hygiene and navigation parity regressions.

## Hidden Risk Sweep
- Async control flow: avoid redirect loops when stripping legacy query hints on canonicalization.
- Hot path performance: no extra lookup round trips introduced by URL cleanup.
- State transition integrity: unresolved episodes must still have explicit recovery path (no action-blocking dead end).
- Dynamic context consistency: switching global country must not mutate an already-open `/$country/...` page.

## Required Patterns
- Route URL is SSOT for library detail/show/episodes pages.
- Library link producers (`History`, `Favorites`, `Subscriptions`) must not attach search hints for content routing.
- `normalizeCountryParam(country)` accepts string input only and returns `SupportedCountry | null`; no fallback to global country.
- First-release policy applies: no compatibility work for old query-hint links and no compatibility layer for old path forms.
- Any retained search fields are non-authoritative metadata only; never required for route correctness.

## Forbidden Dependencies
- No reintroduction of resolver-based country inference in `/$country/podcast/*`.
- No dependency on `location.state.country` for podcast content-route correctness.
- No hand-built `'/podcast/'` or `/${country}/podcast/` string path assembly.

## Implementation Steps
1. Remove Favorites deep-link query hints:
   - Update `apps/lite/src/routeComponents/FavoritesPage.tsx`.
   - Build episode route with `{ country, podcastId, episodeSlug }` only (no `source/feedUrl/audioUrl/providerEpisodeId/sessionId`).

2. Stop query-hint propagation across podcast route components:
   - Update:
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
   - Canonical slug redirects and region-recovery links must not append or forward library query hints.

3. De-scope library search contract to non-critical metadata:
   - Update `apps/lite/src/lib/discovery/libraryRouteSearch.ts`.
   - Ensure route correctness does not rely on any search hint; document this in code comments/types.

4. Guardrail hardening (with allowlist):
   - Extend `apps/lite/scripts/check-route-country-guards.js` (or add sibling guard) to fail production-source usage of:
     - `source: 'history' | 'favorites' | 'subscriptions'` for podcast content-route navigation correctness.
     - query-hint-driven correctness in `/$country/podcast/*`.
   - Keep explicit allowlist for test fixtures (`__tests__`, `*.test.*`, route artifacts).

5. Documentation sync (EN + ZH):
   - Update:
     - `apps/docs/content/docs/apps/lite/routing.mdx`
     - `apps/docs/content/docs/apps/lite/routing.zh.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/history.zh.mdx`
   - Add explicit statement: library entry URLs are canonical path-only; query hints are not required for correctness.

## Acceptance Criteria
- Clicking an episode from Favorites produces URL with no query string for library hints.
- History/Favorites/Subscriptions library deep links all follow the same canonical route shape.
- Refreshing/copy-opening a library-origin detail URL still resolves correctly without query hints.
- Clicking podcast title from episode detail keeps the same `$country` and remains query-clean.
- No new stale-overwrite behavior introduced during country changes in content routes.

## Required Tests
- Favorites navigation URL test: no `source/feedUrl/audioUrl/providerEpisodeId/sessionId` in URL.
- Library route parity tests: History and Favorites generate the same route contract shape.
- Episode detail refresh test from library-origin canonical URL (without query hints).
- Guardrail script test/fixture to prove allowlist does not block test files.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/routeComponents/FavoritesPage.tsx`
  - `apps/lite/src/routeComponents/podcast/*`
  - `apps/lite/src/lib/discovery/libraryRouteSearch.ts`
  - `apps/lite/scripts/check-route-country-guards.js`
  - docs listed above (EN + ZH)
- Regression risks:
  - low-probability slug collision ambiguity when no hint is present.
  - accidental guardrail false positives in test fixtures.
  - legacy external shared links containing old hint query still opening with non-canonical URL.
- Required verification:
  - manual click-through: Explore -> Episode, History -> Episode, Favorites -> Episode.
  - manual refresh and copy-open on a Favorites-origin detail URL.

## Decision Log
- Required: Waived (policy refinement of existing route-country SSOT and URL-canonicality decisions).

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite lint:route-guards`
  - `pnpm -C apps/lite lint:legacy-route-ban`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-12
- Reviewed by: Codex (GPT-5)
