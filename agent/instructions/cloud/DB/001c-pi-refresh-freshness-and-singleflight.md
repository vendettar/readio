# Instruction 001c: PI Refresh, Freshness, And Singleflight [COMPLETED]

Discuss and approve this document before implementation.

Note:
- this instruction replaces the old RSS conditional-fetch idea with PI JSON refresh semantics

Execute after `001b`.

## 1. Goal

Implement PI upstream refresh semantics for the SQLite snapshot layer.

## 2. Scope

- freshness TTL
- `singleflight` refresh dedupe
- transactional snapshot replacement
- failure and backoff bookkeeping

## 3. Must

### 3.1 Keep `singleflight`

Use:

- `singleflight` key = `pi-episodes:` + `podcast_itunes_id`

This remains mandatory after the local-cache cutover.

### 3.2 Refresh Unit

The refresh unit is one canonical podcast identity.

A cold-miss initialization cycle must fetch:

1. `podcasts/byitunesid`
2. `episodes/byitunesid?max=1000`

A stale refresh cycle for an existing snapshot must fetch:

1. `podcasts/byitunesid`
2. `episodes/byitunesid?since=<latest_stored_date_published_unix_minus_one>`

`latest_stored_date_published_unix_minus_one` must come from the newest stored episode for that `podcast_itunes_id`, selected with `ORDER BY published_at_unix DESC LIMIT 1`, then subtracting one second before sending it as the PI `since` value. This prevents permanently skipping same-second upstream episodes.

The cache must not treat these as feed-keyed refreshes.

### 3.3 Outcome Model

Refresh service should return one of:

- `cache_hit`
- `replaced_snapshot`
- `failed`

Current observability alignment:

- the implementation must map these internal refresh outcomes onto the existing discovery cache-status and request-metric vocabulary already used by `cloud-api`
- `cache_hit` should align with the existing fresh-hit behavior
- `replaced_snapshot` should align with the existing refreshed behavior
- serving an expired snapshot because incremental refresh failed should map cleanly onto the existing stale-fallback behavior
- do not introduce a second unrelated status taxonomy in logs and metrics for the same request path unless a separate observability change is approved

### 3.4 Freshness Contract

Use explicit SQLite snapshot freshness state instead of process-memory TTL ownership or RSS conditional headers.

Required fields:

- `last_attempted_fetch_at`
- `last_successful_fetch_at`
- `refresh_not_before`
- `fetch_fail_count`
- `last_error_class`

The first implementation must use this explicit freshness model:

- successful cold initialization sets `last_successful_fetch_at` to the current time
- successful cold initialization sets `refresh_not_before = last_successful_fetch_at + 2h`
- successful incremental refresh sets `last_successful_fetch_at` to the current time, even when PI returns no new episodes
- successful incremental refresh sets `refresh_not_before = last_successful_fetch_at + 2h`
- while `now < refresh_not_before`, route reads must use SQLite directly and must not request PodcastIndex
- when `now >= refresh_not_before`, route reads should attempt an incremental PodcastIndex refresh through `singleflight`
- repeated failures should use bounded retry backoff by moving `refresh_not_before` forward; first-pass defaults:
  - first failure: retry after 5 minutes
  - second failure: retry after 15 minutes
  - third failure: retry after 1 hour
  - fourth and later failures: retry after 6 hours
- cold failures with no usable snapshot must not create placeholder show rows, extra SQLite tables, or process-local state; use structured logs only

Current-structure note:

- today these PI routes use an in-memory TTL cache plus `singleflight`
- after the SQLite cutover, PI podcast detail and episode-list caching must live only in SQLite
- `singleflight` stays, but its job becomes "deduplicate concurrent refreshes for one SQLite-backed podcast snapshot"
- process-memory TTL entries must be removed from PI detail / episodes caching rather than retained as a secondary cache layer
- this instruction does not remove shared discovery memory caching for unrelated Apple top/search or other non-PI-detail/episodes routes

### 3.5 Success Semantics

On successful upstream refresh:

- validate PI response status and required payload shape
- for cold initialization, build bounded snapshot rows from `episodes/byitunesid?max=1000`
- for incremental refresh, build rows only from `episodes/byitunesid?since=<latest_stored_date_published_unix_minus_one>`
- upsert only returned incremental episode rows by `podcastItunesId + episodeGuid`; do not load the full retained window into Go only to merge it
- preserve existing episode `created_at_unix` on upsert while updating mutable episode fields and `updated_at_unix`
- preserve canonical newest-first reads with `ORDER BY published_at_unix DESC, episode_guid ASC`, and recompute `is_truncated` and `approx_bytes` inside the SQLite transaction after the upsert
- derive retained count with `COUNT(*)`; derive latest stored publish time from the latest retained `podcast_episodes` row selected with `ORDER BY published_at_unix DESC LIMIT 1`, then subtract one second for the outbound `since` request; do not persist `stored_episode_count` or `last_episode_published_at` as authoritative fields
- prune the stored window back to the bounded product window in SQL after upserting new rows
- update podcast metadata from `podcasts/byitunesid`
- persist podcast domain metadata, incremental episode upserts, pruning, approximate-size recalculation, and cache-state freshness fields transactionally
- reset failure counters

Incremental no-op behavior:

- if the `since` request returns no new valid episodes, the refresh still counts as successful
- update `last_successful_fetch_at` and `refresh_not_before`
- keep existing episode rows unchanged except for metadata/freshness fields that must be recomputed or refreshed

### 3.6 Failure Semantics

If upstream fetch succeeds but DB persistence fails:

- current request may still return the freshly fetched in-memory response
- DB failure must be logged

If upstream fetch fails and a stale snapshot exists:

- return the existing SQLite snapshot as a stale fallback
- log and emit metrics with the existing stale-fallback cache status
- update failure bookkeeping and bounded retry backoff without deleting the usable snapshot

If no usable snapshot exists:

- fail closed with the normal discovery error mapping
- record structured logs with `podcast_itunes_id` / `error_class` / `error`; do not persist or cache cold failure state

### 3.7 Schema Readiness Assumption

Refresh logic must assume the cache schema was already applied during backend startup.

That means:

- no refresh-path schema bootstrap
- no `create table if missing` fallback
- persistence failures are normal DB failures, not a signal to run DDL

### 3.8 Outbound Tracing Boundary

PodcastIndex refresh requests must preserve the current discovery outbound tracing policy.

Required behavior:

- reuse the existing discovery HTTP client or an equivalent transport configuration
- local outbound spans may be recorded for PodcastIndex requests
- `traceparent` and other trace propagation headers must not be injected into PodcastIndex requests
- tests must cover both cold initialization and incremental `since` refresh requests and prove no `traceparent` header is sent

This applies to any new refresh service introduced by this instruction. Do not create a separate HTTP path that bypasses the existing no-propagation third-party boundary.

## 4. Do Not

- Do not fetch upstream multiple times for the same concurrent stale miss
- Do not create a new PodcastIndex HTTP client that injects outbound trace propagation headers
- Do not send `traceparent` to PodcastIndex during cold initialization or incremental refresh
- Do not run a full `episodes/byitunesid?max=1000` refresh for an existing snapshot when a `since` incremental refresh can be formed
- Do not use request time, `last_successful_fetch_at`, or `refresh_not_before` as the `since` value; use the newest stored episode `datePublished` / `published_at_unix` minus one second
- Do not use `If-None-Match` or `If-Modified-Since` as if this were still the RSS path
- Do not append incremental rows outside the canonical transaction that also updates ordering, clipping, metadata, and freshness
- Do not hide missing-schema problems behind runtime table creation
- Do not keep any process-memory TTL cache for PI podcast detail or episode-list data after the SQLite cutover
- Do not remove or disable the shared `discoveryCache` for unrelated discovery routes such as Apple top/search

## 5. Tests

1. concurrent stale misses collapse into one upstream refresh
2. fresh snapshots younger than 2 hours read from SQLite without a PI request
3. cold miss uses `episodes/byitunesid?max=1000` and persists the initial bounded snapshot
4. stale existing snapshot uses `episodes/byitunesid?since=<latest_stored_date_published_unix_minus_one>`
5. incremental refresh upserts returned episode rows, updates existing returned GUIDs in place, recomputes ordering, and prunes to the bounded window transactionally in SQLite
6. incremental refresh with no new episodes still updates `last_successful_fetch_at` and `refresh_not_before`
7. repeated failures apply bounded backoff
8. stale fallback behaves deterministically when incremental refresh fails
8a. cold upstream failure does not create DB rows, extra tables, or process-local state, and logs the failure
9. refresh uses `podcastItunesId`, never legacy feed transport metadata, as the dedupe key
10. cold initialization and incremental refresh requests do not send `traceparent` to PodcastIndex
11. request metrics and cache-status logging still emit the expected existing labels after the SQLite cutover

## 6. Return

1. refresh service contract
2. state fields updated
3. verification results

## Completion

- Completed by: Codex Worker
- Reviewed by: Codex (GPT-5)
- Commands: `pnpm -C apps/cloud-api exec go test ./...`
- Date: 2026-05-18
- Follow-up: Phase 4 route cutover should review request-context cancellation behavior for singleflight refreshes so one canceled caller does not cancel a shared refresh needed by other concurrent readers.
