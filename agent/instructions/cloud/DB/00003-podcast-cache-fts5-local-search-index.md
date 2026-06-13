# Instruction 00003: Podcast Cache FTS5 Local Search Index Master Plan

Discuss and approve this document before implementation.

This is the parent instruction for adding SQLite FTS5 search over already-cached PodcastIndex show and episode data.

It is not directly executable. Execute the child instructions in order.

## 1. Product Decision

The Cloud searchbox overlay has two independent modules:

- Apple Search API global discovery
- local results

00003 belongs to the local-results side only. It accelerates searching backend-cached PodcastIndex snapshots already present in SQLite.

The cache FTS path must not:

- replace Apple Search API first-hop recall
- change Apple result ranking
- cold-fetch PodcastIndex on an FTS miss
- present backend cache hits as user subscriptions, favorites, history, files, or downloads

Backend SQLite cache is application-local cache, not the user's private browser library.

## 2. Execution Split

Execute in order:

1. `00003a-podcast-cache-fts5-backend-search.md`
2. `00003b-podcast-cache-fts5-frontend-local-search.md`
3. `00003c-podcast-cache-fts5-docs-and-lifecycle.md`

Do not implement 00003 as a single coding task. Backend, frontend, and docs together exceed the 10-file change threshold and must remain split.

## 3. Global Boundaries

- Existing `podcast_shows`, `podcast_episodes`, and `podcast_cache_state` remain canonical.
- FTS tables are derived indexes only.
- Result APIs must join back to canonical tables before returning data.
- Do not expose `podcast_cache_state` freshness, access, failure, eviction, or approximate-size fields through cached search.
- Do not log raw query text.
- Do not put raw query text, podcast IDs, episode GUIDs, or query strings in metric labels or span names.
- Search result misses are local-cache misses only.

## 4. Acceptance Criteria For The Series

- Backend cached podcast and episode search uses SQLite FTS5.
- FTS rows stay consistent after cold replacement, incremental refresh, retention prune, and eviction.
- The public cached-search API contract is explicit and tested.
- Frontend cached results use dedicated result types and labels.
- Apple global search behavior is unchanged.
- Cloud handoff docs are updated in English and Chinese.
- Verification commands from all child instructions pass.

## 5. Prior Generic FTS Note

`agent/instructions/cloud/023b2-pre-cloud-sqlite-fts5-search-integration.md` was an earlier generic FTS design. For this series, prefer the real schema from 00002:

- `podcast_shows`
- `podcast_episodes`
- `podcast_cache_state`

If the older document conflicts with this series, this series wins for PodcastIndex cache search.
