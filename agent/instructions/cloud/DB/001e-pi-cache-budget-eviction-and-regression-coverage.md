# Instruction 001e: PI Cache Budget, Eviction, And Regression Coverage [COMPLETED]

Discuss and approve this document before implementation.

Note:
- this instruction governs the PI episode-list cache budget, not RSS feed-cache budget

Execute last.

## 1. Goal

Bound the local PI cache by size and priority and close the main regression gaps after the SQLite cache cutover.

## 2. Scope

- per-podcast limits
- global budget
- priority-based eviction
- regression coverage

## 3. Must

### 3.1 Per-Podcast Limits

Each cached podcast snapshot must obey:

- max episodes per podcast = `1000`
- optional max bytes per podcast

If oversized:

- keep the newest bounded subset
- mark `is_truncated = 1`

Replacement of old memory-cache behavior:

- oversized PI episode-list payloads should still produce a bounded SQLite snapshot
- budget control must come from clipping, byte estimation, and eviction policy
- budget control must not fall back to the old rule of "payload too large, therefore do not cache this show at all"

### 3.2 Global Budget

Add deterministic first-pass global cache controls:

- max podcasts, default `5000`
- max total approximate bytes, default `1073741824` bytes / 1 GiB

These defaults are first-pass operational safeguards, not product limits. They may become env-configurable later, but the first implementation must not leave the budget unbounded.

### 3.3 Priority

Use the existing integer `priority` column directly.

First-pass rules:

- default `priority = 0`
- higher numbers survive eviction longer
- lower numbers are evicted earlier
- do not implement derived `hot` / `normal` / `cold` classification in the first pass
- do not derive priority from legacy feed transport metadata
- do not derive priority from speculative access-pattern scoring until a later product decision defines that model
- `last_accessed_at` is the first-pass recency signal

### 3.4 Eviction Policy

When over budget, evict in this order:

1. lowest `priority`
2. within the same priority, oldest `last_accessed_at`
3. within the same timestamp, stable `podcast_itunes_id` order for deterministic tests

Do not evict the row currently being refreshed inside the same transaction.

### 3.5 Cleanup

Budget enforcement and cleanup should remain simple.

Acceptable:

- opportunistic eviction after writes
- lightweight periodic cleanup if justified

Do not introduce a large always-on crawler as part of this instruction.

### 3.6 Regression Coverage

Regression coverage must prove:

- cache identity is `podcastItunesId`
- route behavior does not regress back to legacy feed transport identity
- show-page description remains owned by cached `podcasts/byitunesid.description`
- episode detail misses beyond the stored window fail with `episodeNotFound`
- podcast detail contract remains stable where intended
- episode-list regression coverage must validate the new paginated SQLite-backed response contract defined by Instruction `001d`, including page params and snapshot metadata
- request metrics and logging still classify cache behavior with the existing cloud-api cache-status vocabulary

## 4. Do Not

- Do not add eviction rules keyed by legacy feed transport metadata
- Do not silently widen this cache into a full archive
- Do not hide missing tests behind manual validation only
- Do not smuggle budget-related DDL into cleanup code

## 5. Tests

1. oversized snapshots are clipped correctly
2. total budget enforcement evicts lower-priority data first
3. same-priority eviction removes the oldest `last_accessed_at` first
4. deterministic tie-break by `podcast_itunes_id` is test-covered
5. route and cache regressions still pass after SQLite cutover
6. budget-related schema assumptions are satisfied by the same migration path used in production startup
7. eviction and cleanup do not require route-local SQLite bootstrap or an extra independently managed DB handle

## 6. Return

1. budget knobs
2. eviction order
3. verification results

## Completion

- Completed by: Codex Worker
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/cloud-api exec go test ./... -run 'TestPIEpisodeCacheStore(DefaultBudgetConstants|Evicts)'`
  - `pnpm -C apps/cloud-api exec go test ./... -run 'TestPIEpisodeCacheStoreReplaceOpportunisticallyEvictsWithoutEvictingCurrentPodcast|TestRequestMetricLabelMappersUseClosedEnums'`
  - `pnpm -C apps/cloud-api exec go test ./...`
  - `GOCACHE=/tmp/readio-go-cache pnpm -C apps/cloud-api exec go test ./... -run 'TestDiscoveryServicePodcastEpisodesPaginatedSQLiteContract/(podcast detail cold refresh logs refreshed cache status|podcast detail stale fallback logs stale fallback cache status|episode detail cold refresh logs refreshed cache status|missing detail after refresh returns episode not found)'`
  - `pnpm -C apps/cloud-api exec go test ./... -count=1`
- Date: 2026-05-18
