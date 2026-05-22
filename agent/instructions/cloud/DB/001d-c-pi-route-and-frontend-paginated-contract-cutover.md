# Instruction 001d-c: PI Route And Frontend Paginated Contract Cutover [COMPLETED]

Execute after `001d-a`. Consume or replace any safe preparation from `001d-b`.

This is the Phase 4 convergence task. Only this subtask may activate the public paginated SQLite-backed episode-list contract and mark Instruction `001d` complete.

## 1. Goal

Switch Cloud PI podcast detail and episode-list route reads to SQLite-backed snapshots and converge backend route behavior, frontend schemas/consumers, docs, and tests on the paginated response contract.

## 2. Scope

- backend route read-path cutover
- paginated HTTP contract for `GET /api/v1/discovery/podcasts/:itunesId/episodes`
- frontend discovery schema and consumers
- route/page tests
- Cloud handoff/docs updates

## 3. Depends On

- `001d-a-pi-route-read-path-sqlite-foundation.md`
- `001c-pi-refresh-freshness-and-singleflight.md`

## 4. Must

- Podcast detail route reads from the SQLite-backed snapshot when available and refreshes through the `001c` service on miss/stale state.
- Episode-list route returns the paginated SQLite-backed response.
- The response must include at minimum:
  - `episodes`
  - `limit`
  - `offset`
  - `nextOffset`
  - `hasMore`
  - `storedTotal`
  - `isTruncated`
- Include snapshot metadata needed by frontend consumers, including:
  - `lastSuccessfulFetchAt`
  - `nextRefreshAfter`
- Direct episode detail resolution must use SQLite lookup by `podcastItunesId + episodeGuid`.
- Direct episode detail must not trigger PodcastIndex freshness checks; if a target episode is absent from the retained window, preserve `episodeNotFound` behavior.
- Fresh DB hits must not fetch PodcastIndex.
- Ordinary page scrolling must read additional pages from SQLite without repeated PI requests while the snapshot is fresh.
- Remove PI detail / episode-list process-memory TTL ownership for these route reads.
- Keep shared `discoveryCache` behavior for unrelated Apple top/search routes.
- Update frontend schemas, query helpers, route consumers, fixtures, and tests in the same change set.
- Update Cloud docs/handoff to describe the active bounded paginated SQLite snapshot contract.

## 5. Do Not

- Do not return the full stored episode window on every page request.
- Do not keep a legacy `{ episodes }` full-window compatibility layer.
- Do not fake full-history semantics beyond the bounded stored product window.
- Do not use feed URL, RSS XML, PI numeric episode ID, or legacy feed transport metadata as route/cache identity.
- Do not add route-local DDL or a second SQLite connection.
- Do not leave backend, frontend, docs, and tests on different episode-list contract assumptions.

## 6. Verification

Required at minimum:

- `pnpm -C apps/cloud-api exec go test ./...`
- relevant `apps/cloud-ui` unit/schema/route tests for changed consumers

The test set must prove:

- fresh DB hit returns without upstream fetch
- cold miss refreshes and returns only the requested page
- SQL `limit` / `offset` windows are stable
- repeated page scrolling reads SQLite pages without repeated PI fetches
- direct-entry detail resolves from cached rows without a PodcastIndex refresh
- missing direct-entry detail returns `episodeNotFound`
- frontend schema and consumers accept the paginated response contract
- docs describe bounded snapshot semantics, not full-history archive semantics

## 7. Completion Requirement

When complete, append a `## Completion` section with:

- `Completed by`
- `Reviewed by`
- `Commands`
- `Date`
- `Integration Status: Complete; backend route, frontend schema/consumers, docs, and tests converged on the paginated SQLite contract.`

## Completion

- Completed by: Worker
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/cloud-api exec go test ./...`
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/discovery/__tests__/schema.test.ts src/lib/discovery/__tests__/queryCache.test.ts src/lib/discovery/__tests__/cloudCutover.sameOrigin.test.ts src/hooks/__tests__/useEpisodeResolution.cancellation.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.pagination.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx src/lib/discovery/__tests__/podcastQueryContract.test.ts src/lib/discovery/__tests__/cloudApi.errors.test.ts`
  - `pnpm -C apps/cloud-ui exec tsc --noEmit`
  - `pnpm -C apps/cloud-ui exec biome check src/lib/discovery/schema.ts src/lib/discovery/cloudApi.ts src/lib/discovery/index.ts src/lib/discovery/podcastQueryContract.ts src/lib/discovery/queryCache.ts src/lib/discovery/episodeCache.ts src/hooks/usePodcastDetail.ts src/hooks/usePodcastEpisodeList.ts src/hooks/useEpisodeResolution.ts src/hooks/usePodcastEpisodesContent.ts src/hooks/usePodcastShowContent.ts src/lib/routes/episodeResolver.ts src/routeComponents/podcast/PodcastEpisodesPage.tsx 'src/routes/podcast/$country/$id/$episodeKey.tsx' src/lib/discovery/__tests__/fixtures.ts src/lib/discovery/__tests__/schema.test.ts src/lib/discovery/__tests__/queryCache.test.ts src/lib/discovery/__tests__/cloudCutover.sameOrigin.test.ts src/hooks/__tests__/useEpisodeResolution.cancellation.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.pagination.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
- Date: 2026-05-18
- Integration Status: Complete; backend route, frontend schema/consumers, docs, and tests converged on the paginated SQLite contract.
