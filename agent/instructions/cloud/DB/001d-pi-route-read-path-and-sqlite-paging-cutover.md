# Instruction 001d: PI Route Read Path And SQLite-Backed Episode Pagination Cutover [COMPLETED]

Discuss and approve this document before implementation.

Note:
- this instruction is about PI-backed route reads, not an RSS feed route

Execute after `001c`.

## 1. Goal

Move Cloud discovery podcast-detail and episode-list read paths to SQLite-backed PI snapshots so:

- podcast detail reads reuse cached podcast rows
- episode-list reads return paginated results from SQLite
- PI upstream is contacted on cold miss or explicit stale refresh, not on every scroll/page request

## 2. Scope

- route read path
- DB-backed page assembly
- access timestamp updates
- explicit HTTP pagination contract for episode-list reads
- repository-level SQL paging for page reads

## 3. Must

### 3.1 Read Path

For PI-backed podcast content routes:

1. validate and normalize `podcastItunesId`
2. attempt fresh SQLite snapshot read
3. if hit:
   - update `last_accessed_at`
   - read the requested episode page from `podcast_episodes`
   - return paginated response data assembled from SQLite rows
4. if miss or stale:
   - refresh through `singleflight`
   - persist snapshot
   - return the requested page from the new snapshot

Cold-miss behavior must be optimized for the first page:

- first visit for one podcast may fetch upstream and persist up to the bounded local window
- the HTTP response should still only return the requested page (for example the first 20 episodes), not the entire stored window
- subsequent page/scroll requests must read from SQLite rather than calling PI again unless the snapshot is stale and refresh policy says refresh is needed

### 3.2 SQL Paging

Use SQL paging:

- `ORDER BY published_at_unix DESC, episode_guid ASC`
- `LIMIT ? OFFSET ?`

Do not load all stored episodes into Go just to slice them there when SQL can answer directly.

Ordering rule:

- `published_at_unix DESC, episode_guid ASC` must represent the canonical newest-first order defined in `001b`
- episode-list reads should therefore present the most recently published episodes first, with scrolling/pagination moving into older episodes
- route behavior after the SQLite cutover should not preserve arbitrary upstream array ordering when it conflicts with canonical published-time ordering

This instruction intentionally changes the external episode-list read contract:

- `GET /api/v1/discovery/podcasts/:itunesId/episodes` should become a paginated read endpoint backed by SQLite
- the first implementation may use `limit` / `offset`
- the default page size should be small and scroll-friendly (for example `20`)
- repository-level SQL paging is not only an internal optimization; it is the basis of the new frontend-facing paginated response contract

Pre-launch compatibility rule:

- this is an intentional breaking API contract change, not a bug or accidental compatibility risk
- because the product is not yet publicly launched, implementation does not need to preserve the old full-list response shape
- do not add a legacy compatibility layer for `{ episodes }` full-window responses unless a later product decision explicitly requires it
- backend route, frontend schema, frontend consumers, documentation, and automated tests must move to the paginated contract in the same phase

Required first-pass pagination contract:

- request params:
  - `limit`
  - `offset`
- response should include at minimum:
  - `episodes`
  - `limit`
  - `offset`
  - `nextOffset`
  - `hasMore`
  - `storedTotal`
  - `isTruncated`

If the response shape is named differently in implementation, the instruction should still preserve these semantics.

### 3.3 Detail Resolution

Episode detail reads must resolve against the same stored 1000-item window.

Required behavior:

- direct-entry detail lookup uses `podcastItunesId + episodeGuid`
- lookup should happen in SQLite when the snapshot is already available
- if the episode is not present in the current 1000-item window after refresh, return `episodeNotFound`

### 3.4 Product Boundary

Because only the product window is stored:

- deep offsets page only over the stored local window
- the API and docs must not imply full-history semantics
- pagination must stop at the local bounded snapshot rather than pretending the backend can keep paging upstream forever

Useful response metadata includes:

- `storedTotal`
- `isTruncated`
- `lastSuccessfulFetchAt`
- `nextRefreshAfter`

Contract-change rule:

- these pagination and snapshot metadata fields are part of the intended SQLite cutover contract, not optional future ideas
- frontend schema, tests, and route consumers must be updated in the same change set
- this instruction no longer assumes the old full-list response contract remains unchanged
- this pre-launch breaking change should be implemented directly rather than hidden behind a compatibility shim
- frontend expectations that previously preserved upstream PI array order must be updated to the canonical newest-first contract

### 3.5 Preserve Existing Safety

The route cutover must preserve:

- input validation
- existing discovery error mapping
- PI timeout and logging discipline
- canonical route identity based on `podcastItunesId`
- no repeated upstream fetches during ordinary page scrolling when the SQLite snapshot is already fresh

## 4. Do Not

- Do not fetch PI when a fresh SQLite snapshot can satisfy the request
- Do not fake full-history semantics when only a bounded window exists
- Do not reintroduce legacy feed-field-keyed route helpers
- Do not execute cache-table DDL from request handlers
- Do not return the full stored episode window on every page request once paginated SQLite reads are available
- Do not keep page scrolling dependent on repeated third-party API reads when the local snapshot already contains the needed rows

## 5. Tests

1. fresh DB hit returns without upstream fetch
2. SQL `limit/offset` windows are stable
3. stale or miss path refreshes, persists, and returns the expected first page only
4. direct-entry detail resolves from cached rows
5. missing episode after refresh returns `episodeNotFound`
6. repeated page scrolling reads additional episode pages from SQLite without repeated PI fetches
7. the new paginated HTTP response contract is reflected in route schemas and frontend consumers

## 6. Return

1. route read path summary
2. pagination contract
3. verification results

## Completion

- Completed by: Worker
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/cloud-api exec go test ./...`
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/discovery/__tests__/schema.test.ts src/lib/discovery/__tests__/queryCache.test.ts src/lib/discovery/__tests__/cloudCutover.sameOrigin.test.ts src/hooks/__tests__/useEpisodeResolution.cancellation.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.pagination.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx src/lib/discovery/__tests__/podcastQueryContract.test.ts src/lib/discovery/__tests__/cloudApi.errors.test.ts`
  - `pnpm -C apps/cloud-ui exec tsc --noEmit`
- Date: 2026-05-18
