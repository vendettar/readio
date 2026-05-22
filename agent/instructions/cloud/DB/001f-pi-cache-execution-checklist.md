# Instruction 001f: PI Cache Execution Checklist

Discuss and approve this document before implementation.

This is an execution companion for:

- `001-pi-episode-json-cache-master-plan.md`
- `001a-pi-episode-cache-sqlite-schema-and-store.md`
- `001b-pi-snapshot-mapping-and-retention.md`
- `001c-pi-refresh-freshness-and-singleflight.md`
- `001d-pi-route-read-path-and-sqlite-paging-cutover.md`
- `001e-pi-cache-budget-eviction-and-regression-coverage.md`

It does not replace those documents.

## 1. Purpose

Turn the PI SQLite cache plan into a concrete implementation order that matches the current `apps/cloud-api` structure.

Use this checklist to decide:

- what must land first
- which contracts remain stable and which contracts intentionally change during the cutover
- what blocks the next step
- what regression coverage is required before moving on

## 2. Current Baseline

Before implementation starts, the current backend shape is:

- SQLite and goose migrations already run during `cloud-api` startup
- the runtime SQLite handle is opened before HTTP handlers are constructed
- `discoveryService` does not yet receive a PI cache repository/store or the runtime `*sql.DB`
- PI podcast detail and PI episode-list routes still use in-memory TTL caching plus `singleflight`
- the current in-memory cache behavior also includes a memory-protection policy where oversized PI episode payloads may be left uncached
- the current discovery HTTP contract still exposes:
  - `GET /api/v1/discovery/podcasts/:itunesId`
  - `GET /api/v1/discovery/podcasts/:itunesId/episodes`
- however, the target cutover no longer assumes the old full-list episode response shape will survive unchanged
- the episode-list route is expected to move to the paginated SQLite-backed contract defined in `001d`, and frontend consumers must be updated in the same change set
- this is an intentional pre-launch breaking API contract change; do not spend implementation effort preserving the old full-list response shape unless a later product decision explicitly reverses this

Existing repo precedent worth reusing:

- `apps/cloud-api/transcript_storage.go` already demonstrates the intended persistence style for this repo
- the transcript asset schema is deferred and must be reintroduced in a later migration when that product path resumes
- the PI cache schema is delivered as `apps/cloud-api/migrations/00002_pi_episode_json_cache.sql`
- TODO: transcript asset schema deferred, to be reintroduced in a later migration.
- phase planning and review should treat that transcript-storage path as the default structural precedent for:
  - startup-owned DB reuse
  - migration-first schema management
  - helper/store organization
  - tests that validate the real runtime schema path
- this precedent is architectural, not a demand to clone transcript-storage function names or table layout

Cutover target for cache ownership:

- SQLite should become the only cache layer for PI podcast detail and episode-list data
- process-memory TTL caching should be removed for these PI routes
- the old oversized-payload skip-cache behavior should be removed from the PI detail / episodes main path and replaced with bounded durable snapshots
- this cutover is scoped to PodcastIndex detail / episodes only; keep shared `discoveryCache` behavior for unrelated routes such as Apple top/search unless another instruction explicitly changes it

## 3. Execution Order

Execute in this order:

1. service wiring and schema/store foundation
2. snapshot mapping and retention rules
3. refresh semantics and singleflight cutover
4. route read-path cutover to SQLite-backed snapshots
5. budget enforcement and regression hardening

Do not skip forward.

## 4. Phase Checklist

### Phase 1: Service Wiring + Schema / Store Foundation

Goal:

- make the runtime SQLite handle available to discovery cache code
- add schema and repository/store support without changing route behavior yet

Required work:

- expand discovery-service construction so the PI cache store can be injected explicitly
- reuse the startup-owned runtime `*sql.DB`
- add the `00002_pi_episode_json_cache.sql` goose migration for:
  - `podcast_shows`
  - `podcast_episodes`
  - `podcast_cache_state`
- add required indexes
- implement the PI cache repository/store
- keep route behavior unchanged during this phase
- keep the persistence organization recognizably aligned with the existing transcript-storage pattern unless a divergence is justified explicitly in review

Definition of done:

- startup still fails closed on migration failure
- no route-local DDL exists
- no extra SQLite connection is opened for PI cache usage
- repository tests cover transactional snapshot replacement and episode paging
- the chosen store/migration/test shape clearly reuses the repo's existing startup-owned SQLite precedent instead of inventing a parallel persistence style

Hard blockers before Phase 2:

- discovery service still cannot receive the store dependency
- migrations are not idempotent
- schema is created anywhere outside goose migrations

### Phase 2: Snapshot Mapping + Retention Rules

Goal:

- define one canonical in-memory snapshot model and map PI responses into bounded SQLite rows

Required work:

- introduce narrow snapshot types for podcast + episode persistence
- sort episodes by canonical newest-first order before persistence
- clip the stored window to `1000`
- compute:
  - `is_truncated`
  - `approx_bytes`
- derive retained counts with `COUNT(*)` from `podcast_episodes`
- keep canonical identity:
  - podcast = `podcastItunesId`
  - episode = `podcastItunesId + episodeGuid`

Definition of done:

- snapshot mapping does not depend on request handlers
- duplicate GUIDs are handled deterministically
- canonical episode order is `datePublished DESC` with stable tie-break behavior
- `is_truncated` does not pretend the backend knows full history when it only has the bounded cold-initialized plus incremental PI window
- field mapping does not reintroduce RSS-shaped semantics or `descriptionHtml`

Hard blockers before Phase 3:

- ordering is not deterministic
- truncation semantics still rely on impossible knowledge from the current upstream request shape
- approximate size estimation is too unstable for later budget enforcement

### Phase 3: Refresh Semantics + Singleflight

Goal:

- make SQLite the durable snapshot owner while preserving existing refresh discipline

Required work:

- keep `singleflight` keyed by `podcastItunesId`
- define freshness state fields on `podcast_cache_state`
- implement refresh behavior for:
  - fresh snapshot hit
  - cold miss refresh with `episodes/byitunesid?max=1000`
  - stale snapshot refresh with `episodes/byitunesid?since=<latest_stored_date_published_unix>`
  - repeated failure backoff
- use a 2-hour fresh window: `refresh_not_before = last_successful_fetch_at + 2h`
- derive the incremental `since` value from the newest stored episode `published_at_unix`
- upsert only returned incremental episodes, update existing returned GUIDs in place, recompute ordering, prune the bounded window, and update freshness fields in one transaction
- do not read the full retained episode window into Go solely to merge a stale incremental refresh
- preserve the existing third-party outbound tracing boundary:
  - reuse the discovery HTTP client or equivalent no-propagation transport
  - do not inject `traceparent` into PodcastIndex cold initialization or incremental refresh requests
- preserve existing cache-status / metrics vocabulary at the request layer
- remove process-memory TTL caching from PI detail / episodes freshness decisions entirely

Definition of done:

- concurrent stale misses collapse into one upstream refresh
- fresh snapshots younger than 2 hours do not call PodcastIndex
- cold miss and stale refresh use different PI request shapes as defined in `001c`
- no-new-episode incremental refresh still advances `last_successful_fetch_at` and `refresh_not_before`
- DB write failure does not silently corrupt the active snapshot
- stale fallback behavior is explicit and test-covered when incremental refresh fails
- outbound tests prove PodcastIndex refresh requests do not receive `traceparent`
- logs and metrics still classify behavior using the existing cloud-api status vocabulary
- oversized PI episode payloads no longer bypass durable caching purely because they were unsafe for the old in-memory cache layer

Hard blockers before Phase 4:

- refresh path can still trigger ad hoc schema bootstrap
- multiple concurrent stale requests still fan out upstream
- stale existing snapshots still refresh with full `max=1000` requests instead of `since`
- `since` is derived from freshness timestamps instead of the newest stored episode `published_at_unix`
- PodcastIndex refresh code injects `traceparent` or bypasses the current no-propagation outbound policy
- observability semantics diverge from the existing route metrics

### Phase 4: Route Read-Path Cutover

Goal:

- move PI detail and PI episodes routes from in-memory ownership to SQLite-backed snapshot ownership

Phase 4 split status:

- Phase 4 remains incomplete until `001d-c-pi-route-and-frontend-paginated-contract-cutover.md` lands.
- `001d-a-pi-route-read-path-sqlite-foundation.md` and `001d-b-pi-paginated-contract-client-prep.md` may prepare internals, tests, schemas, or docs drafts, but must not be treated as completion of the paginated SQLite contract.
- Only `001d-c` may activate the public paginated episode-list route contract and mark Instruction `001d` complete.

Required work:

- podcast detail route reads cached podcast snapshot first
- episode-list route reads cached episode rows first
- detail resolution uses SQLite lookup by `podcastItunesId + episodeGuid`
- stale or missing snapshots refresh through the Phase 3 flow
- touch `last_accessed_at` on reads
- use SQL paging internally where useful for bounded reads and lookup support

Definition of done:

- podcast detail behavior remains stable where intended
- episode-list behavior follows the new paginated SQLite-backed contract from `001d`
- the old full-list `{ episodes }` response shape is not retained as a compatibility layer
- episode-list ordering follows the canonical newest-first contract from `001b` / `001d`
- fresh DB hits do not fetch PI
- direct-entry detail still returns `episodeNotFound` when the guid is absent from the stored 1000-item window after refresh
- route behavior no longer depends on legacy feed transport metadata or in-memory snapshot ownership

Hard blockers before Phase 5:

- the route still relies on legacy feed-keyed logic
- podcast detail contract drift is introduced accidentally
- episode-list pagination semantics are introduced inconsistently across backend route, schema, and frontend consumers
- episode-list ordering semantics are left half-migrated between backend storage, route output, and frontend/tests
- the cutover still loads and slices all rows in Go when targeted SQL queries are sufficient

### Phase 5: Budget Enforcement + Regression Hardening

Goal:

- bound the cache and close the main regression gaps after cutover

Required work:

- enforce per-podcast window limits
- add first-pass total-budget controls:
  - max podcasts default `5000`
  - max total approximate bytes default `1073741824`
- implement deterministic priority-aware eviction:
  - default `priority = 0`
  - evict lower `priority` first
  - within the same priority, evict oldest `last_accessed_at` first
  - use stable `podcast_itunes_id` tie-breaks for deterministic tests
- do not implement derived hot/normal/cold access classification in the first pass
- make cleanup opportunistic and simple
- add regression coverage for:
  - identity
  - route behavior
  - description ownership
  - episode-not-found behavior
  - startup migration assumptions

Definition of done:

- oversized or over-budget snapshots are evicted in the intended order
- higher-priority entries survive longer than lower-priority entries
- same-priority eviction is ordered by oldest `last_accessed_at`
- cleanup does not need a crawler or route-local schema logic
- post-cutover regressions are covered by automated tests rather than manual validation only

## 5. Cross-Phase Guardrails

These rules apply in every phase:

- do not reintroduce RSS feed XML into page-rendering ownership
- do not use legacy feed transport metadata as canonical identity
- do not create PI cache schema outside goose migrations
- do not open a separate unmanaged SQLite path for this feature
- do not remove or globally disable shared discovery memory caching for non-PI-detail/episodes routes
- do not silently change podcast detail contract behavior
- do not leave episode-list contract changes half-migrated across backend and frontend
- do not treat the stored PI snapshot as a full historical archive

## 6. Verification Gate Per Phase

Do not move to the next phase until all are true:

1. the current phase has automated tests for the new behavior it introduces
2. the current phase preserves intended podcast detail behavior and, when it touches episode-list reads, stays aligned with the explicit paginated contract from `001d`
3. the current phase does not weaken migration/startup guarantees
4. the current phase does not regress canonical identity away from `podcastItunesId`

## 7. Suggested PR Split

Recommended PR order:

1. wiring + migrations + repository/store
2. snapshot mapper + retention rules
3. refresh service + singleflight + state bookkeeping
4. route cutover to SQLite-backed reads
5. budget enforcement + regression hardening

If review load or change size is too high, split phase 1 into:

1. dependency wiring
2. migrations + repository/store

## 8. Exit Criteria

This plan is complete only when:

- PI detail and episode-list routes primarily serve from SQLite-backed snapshots
- refreshes are deduplicated by `podcastItunesId`
- startup remains the only schema bootstrap path
- the frontend-facing podcast detail contract still works
- the frontend-facing episode-list contract works through the new paginated SQLite-backed shape
- regression coverage proves the cutover did not revive RSS or feed-keyed ownership
