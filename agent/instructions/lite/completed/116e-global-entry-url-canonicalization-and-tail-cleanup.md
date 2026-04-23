# Task: 116e (Patch) - Global Entry URL Canonicalization + Tail Cleanup + Transition Context Relocation [COMPLETED]

## Goal
Complete URL-contract unification by removing correctness-critical query hints from all remaining content entry points, and close remaining tail cleanups:
- `/search`, global search overlay, and explore episode entry should navigate to canonical path-only content routes.
- `/$country/podcast/*` route search contract should no longer accept legacy library hints.
- `useEpisodeResolution` should remove unused context input and rely on route params + shared slug/feed/provider resolution only.
- `fromLayoutPrefix` (shared-element transition metadata) must move from URL query to typed `location.state`.

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: no schema changes; no migration/backfill.
- Routing: tighten `/$country/podcast/*` search validation, remove extra search propagation from non-library entry points, and remove `fromLayoutPrefix` query transport.
- Logging: no new logging paths required.
- Network: no endpoint changes.
- Storage: no cache namespace change.
- UI state: transition metadata (`fromLayoutPrefix`) is state-only and optional (refresh-safe fallback required).
- Tests: add regression tests for Search/GlobalSearch/Explore URL hygiene, transition state transport, and tail cleanup behavior.

## Hidden Risk Sweep
- Async control flow: ensure route-country switch still cancels old requests and does not apply stale responses.
- Hot-path performance: removing query-hint fallback must not add extra retries or duplicate fetches.
- State transition integrity: region-unavailable state must still provide explicit recovery CTA.
- Dynamic context consistency: changing global country must not mutate already-open `/$country/...` page behavior.
- `location.state` is ephemeral on refresh/direct-open: missing transition state must degrade deterministically to default layoutId path.

## Required Patterns
- Content route correctness authority: `/$country/$id/$episodeId` path params only.
- Canonical deep links to episode detail must not include `source/feedUrl/audioUrl/providerEpisodeId/sessionId`.
- Keep route builders as the only route-construction entry (`buildPodcastShowRoute`, `buildPodcastEpisodeRoute`, `buildPodcastEpisodesRoute`).
- `normalizeCountryParam(country)` stays strict (`SupportedCountry | null`) with no global fallback.
- First-release policy applies: no compatibility handling for legacy query-hint URLs.
- `fromLayoutPrefix` must not be carried by URL query; it must be read from typed `location.state` only.

## Forbidden Dependencies
- No reintroduction of `useResolvedLibraryCountry` or `location.state.country` in content-route correctness path.
- No manual string assembly of podcast routes.
- No hidden resolver fallback that depends on URL search hints.
- No `fromLayoutPrefix` write/read via URL `search`.
- No untyped `any`/`Record<string, any>` state reads for transition context.

## Implementation Steps
1. Remove remaining query hints from non-library entry points:
   - Update:
     - `apps/lite/src/routeComponents/SearchPage.tsx`
     - `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
     - `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
     - `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
   - Keep canonical navigation payload path-only.

2. Move transition context to state-only transport:
   - Update:
     - `apps/lite/src/components/Explore/PodcastShowsCarousel.tsx`
     - `apps/lite/src/components/Explore/PodcastShowCard.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
   - Remove `fromLayoutPrefix` from `search` writes.
   - Read typed transition context from `useLocation().state` in show page.
   - Ensure state-missing fallback uses deterministic default layoutId without runtime errors.

3. Tighten content-route search schemas:
   - Update:
     - `apps/lite/src/lib/discovery/libraryRouteSearch.ts`
     - `apps/lite/src/routes/$country/podcast/$id/index.tsx`
     - `apps/lite/src/routes/$country/podcast/$id/episodes.tsx`
     - `apps/lite/src/routes/$country/podcast/$id/episode/$episodeId.tsx`
   - Remove `fromLayoutPrefix` from `podcastShowSearchSchema`.
   - Remove legacy library-hint acceptance for episode/episodes routes.
   - Preserve only explicitly justified, non-correctness search keys (if any).

4. Remove `useEpisodeResolution` context tail:
   - Update:
     - `apps/lite/src/hooks/useEpisodeResolution.ts`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
   - Delete unused context parameter and context-based resolution branches.
   - Keep deterministic resolution order:
     - strict shortId8 token matching,
     - title slug tie-breaker,
     - stable recency/id fallback.

5. Guardrail hardening:
   - Extend `apps/lite/scripts/check-route-country-guards.js` to block query-hint correctness patterns in:
     - `SearchPage`,
     - `GlobalSearch/*`,
     - `Explore/PodcastEpisodesGrid`,
     - `/$country/podcast/*`.
   - Add rule to block `fromLayoutPrefix` in URL search writes/reads in production source.
   - Maintain allowlist for fixtures/tests (`__tests__`, `*.test.*`, generated route files).

6. Documentation sync (EN + ZH):
   - Update:
     - `apps/docs/content/docs/apps/lite/routing.mdx`
     - `apps/docs/content/docs/apps/lite/routing.zh.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`
     - `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
     - `apps/docs/content/docs/apps/lite/ui-patterns/features.zh.mdx`
   - Explicitly state: all in-app entry points now emit canonical path-only content URLs.
   - Explicitly state: transition context (`fromLayoutPrefix`) is location state metadata, not URL contract.

## Acceptance Criteria
- Search, GlobalSearch, and Explore episode clicks all navigate without `source/feedUrl/audioUrl/providerEpisodeId/sessionId`.
- Explore -> Podcast Show URL does not contain `fromLayoutPrefix`.
- Shared-element transition continues to work when state exists.
- Refresh/direct-open of show page stays stable when state is missing.
- `/$country/podcast/$id/episodes` and `/$country/podcast/$id/episode/$episodeId` ignore/strip legacy library-hint search params (no strict rejection).
- Episode detail refresh works from canonical path-only URLs regardless of entry source.
- `useEpisodeResolution` has no context input and no context-branch correctness path.
- No stale-response overwrite regression on country changes.

## Required Tests
- URL hygiene tests for:
  - `SearchPage`,
  - `GlobalSearch/SearchEpisodeItem`,
  - `GlobalSearch/CommandPalette`,
  - `Explore/PodcastEpisodesGrid`.
- Transition-state tests for:
  - `PodcastShowsCarousel` / `PodcastShowCard` caller no longer writes `fromLayoutPrefix` to search,
  - `PodcastShowPage` reads typed `location.state` and handles missing state fallback.
- Route search validation tests:
  - legacy query hints are not part of accepted episode/episodes route contract and are stripped to `{}`.
  - `fromLayoutPrefix` is stripped (not consumed) in show-route search schema.
- `useEpisodeResolution` unit tests:
  - no context param path,
  - deterministic shortId8 resolution remains stable.
- Guardrail tests:
  - production-source violations fail,
  - allowlisted tests/fixtures pass.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/routeComponents/SearchPage.tsx`
  - `apps/lite/src/components/GlobalSearch/*`
  - `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
  - `apps/lite/src/components/Explore/PodcastShowsCarousel.tsx`
  - `apps/lite/src/components/Explore/PodcastShowCard.tsx`
  - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
  - `apps/lite/src/lib/discovery/libraryRouteSearch.ts`
  - `apps/lite/src/routes/$country/podcast/*`
  - `apps/lite/src/hooks/useEpisodeResolution.ts`
  - `apps/lite/scripts/check-route-country-guards.js`
- Regression risks:
  - reduced disambiguation when shortId collisions happen in extreme edge cases.
  - shared-element transition mismatch if state is not passed at one caller.
  - route validation tightening breaking intentionally malformed internal test fixtures.
  - missed entry points reintroducing query hints.
- Required verification:
  - manual click-through matrix:
    - Explore -> Episode,
    - Search -> Episode,
    - GlobalSearch -> Episode,
    - History/Favorites/Subscriptions -> Episode.
  - refresh/copy-open for each route shape above.

## Decision Log
- Required: Yes (record final URL-contract unification decision, `fromLayoutPrefix -> location.state` rationale, and de-scoped search/context rationale in EN + ZH).

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
