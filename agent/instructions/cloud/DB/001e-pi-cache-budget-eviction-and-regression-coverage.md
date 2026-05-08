# Instruction 001e: PI Cache Budget, Eviction, And Regression Coverage

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

### 3.2 Global Budget

Add global cache controls such as:

- max podcasts
- max total approximate bytes

### 3.3 Priority

Support priority tiers such as:

- `hot`
- `normal`
- `cold`

Priority should be derived from actual product access patterns, not legacy feed transport metadata.

### 3.4 Eviction Policy

When over budget, evict in this order:

1. stale and cold
2. stale and lowest priority with oldest access
3. oldest low-priority entries

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

## 4. Do Not

- Do not add eviction rules keyed by legacy feed transport metadata
- Do not silently widen this cache into a full archive
- Do not hide missing tests behind manual validation only
- Do not smuggle budget-related DDL into cleanup code

## 5. Tests

1. oversized snapshots are clipped correctly
2. total budget enforcement evicts lower-priority data first
3. hot podcasts survive eviction longer than cold podcasts
4. route and cache regressions still pass after SQLite cutover
5. budget-related schema assumptions are satisfied by the same migration path used in production startup

## 6. Return

1. budget knobs
2. eviction order
3. verification results
