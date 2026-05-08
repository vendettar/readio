# Instruction 001a: PI Episode JSON Cache SQLite Schema And Store

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
- transaction boundaries for snapshot replacement

## 3. Must

### 3.1 Tables

Create:

- `cloud_pi_podcasts`
- `cloud_pi_episodes`

Recommended columns for `cloud_pi_podcasts`:

- `podcast_itunes_id TEXT PRIMARY KEY`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `author TEXT`
- `image TEXT`
- `feed_url TEXT`
- `language TEXT`
- `categories_json TEXT`
- `episode_count_hint INTEGER`
- `last_episode_published_at TEXT`
- `stored_episode_count INTEGER NOT NULL DEFAULT 0`
- `is_truncated INTEGER NOT NULL DEFAULT 0`
- `last_successful_fetch_at TEXT NOT NULL`
- `last_attempted_fetch_at TEXT`
- `next_refresh_after TEXT NOT NULL`
- `fetch_fail_count INTEGER NOT NULL DEFAULT 0`
- `last_error_class TEXT`
- `approx_bytes INTEGER NOT NULL DEFAULT 0`
- `priority INTEGER NOT NULL DEFAULT 0`
- `last_accessed_at TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Recommended columns for `cloud_pi_episodes`:

- `podcast_itunes_id TEXT NOT NULL`
- `episode_guid TEXT NOT NULL`
- `sort_index INTEGER NOT NULL`
- `title TEXT NOT NULL`
- `description TEXT NOT NULL`
- `audio_url TEXT NOT NULL`
- `published_at TEXT NOT NULL`
- `published_at_unix INTEGER NOT NULL`
- `duration_seconds INTEGER NOT NULL`
- `episode_artwork_url TEXT`
- `episode_number INTEGER`
- `season_number INTEGER`
- `episode_type TEXT`
- `explicit INTEGER`
- `link TEXT`
- `enclosure_length INTEGER`
- `transcript_url TEXT`
- `chapters_url TEXT`
- `source_pi_item_id TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`
- `PRIMARY KEY (podcast_itunes_id, episode_guid)`
- foreign key to `cloud_pi_podcasts(podcast_itunes_id)` with `ON DELETE CASCADE`

### 3.2 Indexes

Create at minimum:

- `idx_cloud_pi_podcasts_next_refresh_after`
- `idx_cloud_pi_podcasts_priority_last_accessed`
- `idx_cloud_pi_episodes_podcast_sort`
- `idx_cloud_pi_episodes_podcast_published_at`

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

- SQL read/write
- row scanning
- SQL paging
- transaction boundaries for snapshot replace

The repository should not own:

- PI upstream HTTP fetch
- PI response validation
- request routing

### 3.4 Migration Delivery Path

The cache tables must be created and evolved through the shared backend migration mechanism.

Required rules:

- create the tables with versioned SQL migrations under `apps/cloud-api/migrations/`
- apply those migrations during `cloud-api` startup before HTTP handlers are registered
- keep repository code focused on DML/query behavior
- if the schema changes later, add new migrations instead of editing shipped migrations

### 3.5 Startup Contract

The repository may assume schema readiness.

That means:

- startup migration application is responsible for making the tables and indexes exist
- route handlers must not lazily create cache tables
- refresh paths must not attempt schema bootstrap on demand
- migration failure must block startup

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

## 6. Return

1. schema
2. repository API
3. verification results
