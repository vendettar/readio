# Instruction 001a: Feed SQLite Schema And Store

Execute first.

## Goal

Create the SQLite schema and repository/store layer for parsed feed snapshots.

## Scope

- SQLite table definitions
- indexes
- migration delivery contract for feed tables
- feed store/repository API
- transaction boundaries for snapshot replacement

## Must

### 1. Tables

Create:

- `cloud_feeds`
- `cloud_feed_episodes`

Recommended columns:

`cloud_feeds`
- `feed_key TEXT PRIMARY KEY`
- `feed_url TEXT NOT NULL`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `artwork_url TEXT`
- `stored_episode_count INTEGER NOT NULL DEFAULT 0`
- `total_seen_episode_count INTEGER NOT NULL DEFAULT 0`
- `is_truncated INTEGER NOT NULL DEFAULT 0`
- `last_successful_fetch_at INTEGER NOT NULL`
- `last_attempted_fetch_at INTEGER`
- `next_refresh_after INTEGER NOT NULL`
- `etag TEXT`
- `last_modified TEXT`
- `fetch_fail_count INTEGER NOT NULL DEFAULT 0`
- `last_error_class TEXT`
- `approx_bytes INTEGER NOT NULL DEFAULT 0`
- `priority INTEGER NOT NULL DEFAULT 0`
- `last_accessed_at INTEGER NOT NULL`
- `created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))`
- `updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))`

`cloud_feed_episodes`
- `feed_key TEXT NOT NULL`
- `episode_guid TEXT NOT NULL`
- `sort_index INTEGER NOT NULL`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `description_html TEXT`
- `audio_url TEXT NOT NULL`
- `pub_date TEXT NOT NULL`
- `pub_date_unix INTEGER`
- `artwork_url TEXT`
- `duration REAL`
- `season_number INTEGER`
- `episode_number INTEGER`
- `episode_type TEXT`
- `explicit INTEGER`
- `link TEXT`
- `file_size INTEGER`
- `transcript_url TEXT`
- `updated_at INTEGER NOT NULL`
- `PRIMARY KEY (feed_key, episode_guid)`
- foreign key to `cloud_feeds(feed_key)` with `ON DELETE CASCADE`

### 2. Indexes

Create at minimum:

- `idx_cloud_feeds_next_refresh_after`
- `idx_cloud_feeds_priority_last_accessed`
- `idx_cloud_feed_episodes_feed_sort`
- `idx_cloud_feed_episodes_feed_pubdate`

### 3. Repository

Create a repository/store file such as:

- `apps/cloud-api/feed_store.go`

Recommended methods:

- `GetFreshFeedPage(...)`
- `GetFeedRefreshState(...)`
- `ReplaceFeedSnapshotTx(...)`
- `TouchFeedAccess(...)`
- `EvictFeedsOverBudget(...)`

The repository should own:

- SQL read/write
- row scanning
- SQL paging
- transaction boundaries for snapshot replace

The repository should not own:

- upstream HTTP fetch
- XML parsing
- URL validation

### 4. Migration Delivery Path

Feed-cache tables must be created and evolved through the shared backend migration mechanism, not through handwritten schema bootstrap inside repository code.

Required rules:

- create `cloud_feeds` / `cloud_feed_episodes` with versioned SQL migrations under `apps/cloud-api/migrations/`
- apply those migrations during `cloud-api` startup before HTTP handlers are registered
- keep repository code focused on DML/query behavior; it must not own DDL
- if feed-cache schema changes later, add new migration files rather than editing historical shipped migrations

Recommended migration split:

1. create `cloud_feeds`
2. create `cloud_feed_episodes`
3. add required indexes

These may be collapsed into fewer files if the step remains coherent and reviewable, but they must still be versioned migrations.

### 5. Startup Contract

The feed-cache repository may assume schema readiness.

That means:

- startup migration application is responsible for making the tables/indexes exist
- route handlers must not lazily create feed-cache tables
- refresh paths must not attempt schema bootstrap on demand
- migration failure must block startup instead of being deferred to first request

## Do Not

- Do not store raw XML columns
- Do not add generic unbounded blob/json columns as a shortcut
- Do not make the repository own HTTP/refresh logic
- Do not put feed-cache DDL in route handlers, refresh services, or repository constructors
- Do not maintain a test-only schema initializer that diverges from the production migration path

## Tests

1. empty DB applies feed migrations successfully
2. rerunning startup on an already migrated DB is idempotent
3. migrated schema contains both tables and required indexes
4. foreign key cascade works
5. paging query works on stored episodes
6. transactional replace leaves feed/episodes in sync

## Return

1. schema
2. repository API
3. verification results
