# Instruction 001: SQLite-Backed PI Episode JSON Cache Master Plan

Discuss and approve this document before implementation.

Note:
- this is not an RSS/feed XML plan
- the active cache target is PodcastIndex JSON data shaped by `podcasts/byitunesid` and `episodes/byitunesid`

## 1. Objective

Add a backend-local SQLite cache in `apps/cloud-api` for PodcastIndex podcast detail and episode-list data so Cloud pages can reuse a bounded local JSON-derived snapshot instead of calling PI on every request.

This instruction is the parent plan for the future cache implementation.

It must stay aligned with:
- `agent/instructions/cloud/refractor/008-cloud-discovery-podcastindex-episodes-primary-cutover.md`
- `agent/instructions/cloud/023a-cloud-backend-sqlite-goose-foundation.md`

## 2. Parent Decisions

- Page-rendering data ownership remains:
  - podcast metadata = `podcasts/byitunesid`
  - episode list cold bootstrap = `episodes/byitunesid?max=1000`
  - episode detail = SQLite direct lookup by `podcastItunesId + episodeGuid`
- RSS feed XML is out of scope for page rendering and out of scope for this cache.
- Legacy feed transport metadata must not participate in the active cache contract.
- Canonical cache identity is `podcastItunesId`.
- Canonical episode identity is `podcastItunesId + episodeGuid`.
- The cache stores PI JSON-derived structured snapshots, not raw RSS and not raw XML.
- The cache should prefer structured SQLite rows over a single opaque raw JSON blob.
- The cache is bounded and recent-window-based, not a full podcast archive.
- SQLite becomes the only cache layer for PI podcast detail and episode-list snapshots.
- The existing in-memory TTL cache and its oversized-payload skip-cache policy are old behavior and should be removed for PI detail / episodes reads after the SQLite cutover lands.
- This cache ownership change is scoped only to PodcastIndex podcast-detail and episode-list snapshots; other discovery in-memory cache users such as Apple top/search routes must remain unchanged unless a separate instruction explicitly changes them.
- The fixed product window for page rendering remains `max=1000`.
- Cold-open detail semantics remain unchanged:
  - resolve by `podcastItunesId`
  - load cached or refreshed episode list
  - if target `episodeGuid` is absent from the 1000-item window, return `episodeNotFound`
- Show-page description ownership remains `podcasts/byitunesid.description`.
- Schema creation and evolution must go through `goose` migrations under `apps/cloud-api/migrations/`.

## 3. Execution Split

Execute these child instructions in order:

1. `001a-pi-episode-cache-sqlite-schema-and-store.md`
2. `001b-pi-snapshot-mapping-and-retention.md`
3. `001c-pi-refresh-freshness-and-singleflight.md`
4. `001d-pi-route-read-path-and-sqlite-paging-cutover.md`
5. `001e-pi-cache-budget-eviction-and-regression-coverage.md`

Implementation note before execution:

- the current `apps/cloud-api` startup path already opens SQLite and applies goose migrations before handlers are registered
- the current `discoveryService` does not yet receive the runtime `*sql.DB` handle or a PI cache repository/store dependency
- execution of this plan must therefore begin by extending discovery-service construction so the PI cache store can be injected explicitly instead of being created ad hoc inside route handlers

## 4. Global Boundaries

- Do not fetch or parse RSS feed XML for cache population.
- Do not use legacy feed transport metadata as cache identity, route key, or page-resolution key.
- Do not store raw XML.
- Do not treat the cache as a complete historical archive.
- Do not reintroduce `descriptionHtml`.
- Do not use PI numeric episode `id` as canonical UI or cache identity.
- Do not create or evolve tables through route-local `CREATE TABLE IF NOT EXISTS`.
- Do not let tests rely on a schema path that production startup does not execute.

## 5. Target Architecture

- `podcast_shows`
  - one row per `podcast_itunes_id`
  - holds only podcast domain/detail fields derived from `podcasts/byitunesid`
- `podcast_episodes`
  - bounded episode rows for one `podcast_itunes_id`
  - ordered newest-first inside the stored window
- `podcast_cache_state`
  - one row per `podcast_itunes_id`
  - holds refresh, backoff, eviction, truncation, and access metadata
- request-time behavior
  - validate `podcastItunesId`
  - read fresh cached podcast detail / episode rows if available
  - otherwise refresh from PI through `singleflight`
  - serve pages from the structured snapshot

Contract alignment:

- podcast detail may remain logically compatible with the current `GET /api/v1/discovery/podcasts/:itunesId` response shape
- episode-list reads no longer assume the old full-list response contract remains unchanged
- the episode-list contract change is intentional and allowed because the product is still pre-launch; no backward-compatible legacy response layer is required
- the SQLite cutover for `GET /api/v1/discovery/podcasts/:itunesId/episodes` is expected to land together with an explicit paginated HTTP contract
- that paginated contract is defined by child Instruction `001d`, including request pagination params and snapshot metadata needed by the frontend
- frontend discovery schema, query helpers, and page consumers must be updated in the same implementation wave as the backend route cutover instead of treating pagination as a later optional follow-up

Current cache-ownership rule:

- after this plan lands, PI podcast detail and episode-list caching must not use process-memory TTL entries at all
- the shared `discoveryCache` type may continue to serve non-PI-detail/episodes routes such as Apple top/search; do not remove or disable it globally
- remove only the PI detail / episodes memory TTL ownership, including keys such as `podcastindex-podcast-itunes:<id>` and `podcastindex-episodes-itunes:<id>`
- freshness should be modeled by SQLite snapshot state such as `last_successful_fetch_at` / `refresh_not_before`
- `singleflight` remains useful, but only for deduplicating concurrent refresh work against the SQLite-backed snapshot contract

## 6. Final Product Boundary

After all child instructions land:

- Cloud discovery pages should primarily reuse SQLite-backed PI snapshots
- PI requests should be reduced for hot shows
- backend disk should carry the main episode-list cache burden
- only the bounded 1000-item product window should be retained per show
- feed XML should still be absent from page-rendering and cache ownership

## 7. Return

Implementation following this plan should report:

1. created child instructions
2. execution order
3. preserved boundaries
