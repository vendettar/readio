# Instruction 001a: PI Episode JSON Cache SQLite Schema And Store [COMPLETED]

Discuss and approve this document before implementation.

Note:
- this instruction defines PI JSON cache storage, not RSS feed storage

Execute first.

## 1. Goal

Create the SQLite schema and repository/store layer for PodcastIndex podcast detail and episode-list snapshots.

## 2. Scope

- SQLite table definitions
- indexes
- migration delivery contract
- repository/store API
- discovery-service dependency wiring needed to consume the store
- transaction boundaries for snapshot replacement

## 3. Must

### 3.1 Tables

Create:

- `podcast_shows`
- `podcast_episodes`
- `podcast_cache_state`

Recommended columns for `podcast_shows` domain data:

- `podcast_itunes_id TEXT PRIMARY KEY`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `author TEXT`
- `image TEXT`
- `feed_url TEXT`
- `language TEXT`
- `categories_json TEXT`
- `episode_count_hint INTEGER`
- `feed_last_update_time_unix INTEGER NOT NULL DEFAULT 0`
- `created_at_unix INTEGER NOT NULL`
- `updated_at_unix INTEGER NOT NULL`

Recommended columns for `podcast_episodes`:

- `podcast_itunes_id TEXT NOT NULL`
- `episode_guid TEXT NOT NULL`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `enclosure_url TEXT NOT NULL`
- `published_at_unix INTEGER NOT NULL`
- `duration_seconds INTEGER NOT NULL`
- `image TEXT`
- `episode_number INTEGER`
- `season_number INTEGER`
- `episode_type TEXT`
- `explicit INTEGER`
- `link TEXT`
- `enclosure_length INTEGER`
- `transcript_url TEXT`
- `created_at_unix INTEGER NOT NULL`
- `updated_at_unix INTEGER NOT NULL`
- `PRIMARY KEY (podcast_itunes_id, episode_guid)`
- foreign key to `podcast_shows(podcast_itunes_id)` with `ON DELETE CASCADE`

Recommended columns for `podcast_cache_state` cache metadata:

- `podcast_itunes_id TEXT PRIMARY KEY`
- `is_truncated INTEGER NOT NULL DEFAULT 0`
- `last_successful_fetch_at_unix INTEGER NOT NULL`
- `last_attempted_fetch_at_unix INTEGER NOT NULL DEFAULT 0`
- `refresh_not_before_unix INTEGER NOT NULL`
- `fetch_fail_count INTEGER NOT NULL DEFAULT 0`
- `last_error_class TEXT`
- `approx_bytes INTEGER NOT NULL DEFAULT 0`
- `priority INTEGER NOT NULL DEFAULT 0`
- `last_accessed_at_unix INTEGER NOT NULL`
- foreign key to `podcast_shows(podcast_itunes_id)` with `ON DELETE CASCADE`

Derived counts and dates:

- `totalCount` must come from `COUNT(*)` over `podcast_episodes`, not a stored podcast/cache-state counter.
- incremental refresh `since` must come from the latest retained `podcast_episodes` row selected with `ORDER BY published_at_unix DESC LIMIT 1`.
- do not persist `last_episode_published_at`; it is derivable from episode rows.

### 3.2 Indexes

Create at minimum:

- `idx_podcast_cache_state_priority_last_accessed`
- `idx_podcast_episodes_podcast_published_at`

### 3.3 Repository

Create a repository/store file such as:

- `apps/cloud-api/pi_episode_cache_store.go`

Recommended methods:

- `GetPodcastSnapshot(...)`
- `GetEpisodePage(...)`
- `GetEpisodeByGuid(...)`
- `GetRefreshState(...)`
- `ReplacePodcastSnapshotTx(...)`
- `TouchPodcastAccess(...)`
- `EvictPodcastsOverBudget(...)`

The repository should own:

- sqlc-generated SQL read/write methods under `apps/cloud-api/internal/db/sqlc`
- handwritten store-level adapters that convert sqlc rows/nullable values into existing domain structs
- row scanning
- SQL paging
- transaction boundaries for snapshot replace

SQL ownership:

- keep the canonical sqlc schema in `apps/cloud-api/internal/db/schema.sql`
- keep PI cache queries in `apps/cloud-api/internal/db/queries/pi_episode_cache.sql`
- keep generation reproducible through `go generate ./internal/db` from `apps/cloud-api`
- keep goose migrations as the runtime migration source; do not feed goose Down sections or `DROP TABLE` statements into sqlc schema generation
- transaction orchestration remains in `pi_episode_cache_store.go`; sqlc should provide typed query methods, not own refresh or eviction business flow

The repository should not own:

- PI upstream HTTP fetch
- PI response validation
- request routing

`feed_url` boundary:

- if `feed_url` is retained, it is only stored as non-canonical PI podcast metadata
- it must not participate in route identity, refresh identity, cache lookup identity, paging identity, or episode-detail resolution
- the presence of this column must not be read as a signal that RSS/XML feed transport has returned to the episode ownership path

Current wiring rule:

- the current `cloud-api` process already opens one runtime SQLite handle during startup
- the PI cache repository/store must reuse that startup-owned `*sql.DB`
- `newDiscoveryService(...)` must be expanded so the discovery service can receive the PI cache store explicitly
- do not open a second route-local SQLite connection for PI cache reads/writes
- do not instantiate the store lazily inside request handlers

Implementation-shape alignment:

- this repo already contains a stable persistence code example built on the same infrastructure:
  - `apps/cloud-api/transcript_storage.go`
- the transcript asset schema is deferred and must be reintroduced in a later migration when that product path resumes
- the PI cache migration is delivered as `00002_pi_episode_json_cache.sql`
- TODO: transcript asset schema deferred, to be reintroduced in a later migration.
- PI cache storage should align with that proven shape at the infrastructure boundary:
  - startup-owned runtime `*sql.DB`
  - migration-first schema lifecycle through `goose`
  - helper/store functions that receive and reuse the runtime DB handle instead of bootstrapping their own DB path
  - tests that exercise the same startup-owned schema assumptions production uses
- this does not require PI cache code to copy transcript-storage APIs field-for-field
- it does require PI cache persistence to follow the same architectural pattern unless an explicit reason is documented

### 3.4 Migration Delivery Path

The cache tables must be created and evolved through the shared backend migration mechanism.

Required rules:

- create the tables in `apps/cloud-api/migrations/00002_pi_episode_json_cache.sql`
- apply those migrations during `cloud-api` startup before HTTP handlers are registered
- keep repository code focused on DML/query behavior
- if the schema changes after this baseline is shipped, add new migrations instead of editing shipped migrations

### 3.5 Startup Contract

The repository may assume schema readiness.

That means:

- startup migration application is responsible for making the tables and indexes exist
- route handlers must not lazily create cache tables
- refresh paths must not attempt schema bootstrap on demand
- migration failure must block startup
- discovery-service construction may assume the schema is ready because startup already opened SQLite and completed migrations before the HTTP mux is built

## 4. Do Not

- Do not create a table keyed by legacy feed transport metadata
- Do not add raw XML columns
- Do not add `description_html`
- Do not make the repository own PI HTTP logic
- Do not put DDL in route handlers, refresh services, or repository constructors

## 5. Tests

1. empty DB applies the PI cache migrations successfully
2. rerunning startup on an already migrated DB is idempotent
3. migrated schema contains both tables and required indexes
4. foreign key cascade works
5. paging query works on stored episodes
6. transactional replace leaves podcast row and episode rows in sync
7. discovery-service construction can consume the repository/store without opening an extra SQLite handle

## 6. Return

1. schema
2. repository API
3. verification results

## Completion

- Completed by: Worker
- Reviewed by: Codex (GPT-5)
- Commands: `pnpm -C apps/cloud-api exec go test ./...`
- Date: 2026-05-18
