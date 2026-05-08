# Instruction 001d: PI Route Read Path And SQLite Paging Cutover

Discuss and approve this document before implementation.

Note:
- this instruction is about PI-backed route reads, not an RSS feed route

Execute after `001c`.

## 1. Goal

Move Cloud discovery podcast-detail and episode-list read paths to the SQLite PI cache so they serve fresh cached snapshots when available and refresh from PI only on miss or staleness.

## 2. Scope

- route read path
- DB-backed page assembly
- access timestamp updates
- request contract preservation

## 3. Must

### 3.1 Read Path

For PI-backed podcast content routes:

1. validate and normalize `podcastItunesId`
2. attempt fresh SQLite snapshot read
3. if hit:
   - update `last_accessed_at`
   - page from `cloud_pi_episodes`
   - return podcast detail plus the requested episode slice
4. if miss or stale:
   - refresh through `singleflight`
   - persist snapshot
   - return the requested view from the new snapshot

### 3.2 SQL Paging

Use SQL paging:

- `ORDER BY sort_index ASC`
- `LIMIT ? OFFSET ?`

Do not load all stored episodes into Go just to slice them there when SQL can answer directly.

### 3.3 Detail Resolution

Episode detail reads must resolve against the same stored 1000-item window.

Required behavior:

- direct-entry detail lookup uses `podcastItunesId + episodeGuid`
- lookup should happen in SQLite when the snapshot is already available
- if the episode is not present in the current 1000-item window after refresh, return `episodeNotFound`

### 3.4 Product Boundary

Because only the product window is stored:

- deep offsets page over the stored 1000-item window
- the API and docs must not imply full-history semantics

If the response shape is extended, useful metadata may include:

- `storedTotal`
- `isTruncated`
- `lastSuccessfulFetchAt`

### 3.5 Preserve Existing Safety

The route cutover must preserve:

- input validation
- existing discovery error mapping
- PI timeout and logging discipline
- canonical route identity based on `podcastItunesId`

## 4. Do Not

- Do not fetch PI when a fresh SQLite snapshot can satisfy the request
- Do not fake full-history semantics when only a bounded window exists
- Do not reintroduce legacy feed-field-keyed route helpers
- Do not execute cache-table DDL from request handlers

## 5. Tests

1. fresh DB hit returns without upstream fetch
2. SQL `limit/offset` windows are stable
3. stale or miss path refreshes and returns the expected page
4. direct-entry detail resolves from cached rows
5. missing episode after refresh returns `episodeNotFound`

## 6. Return

1. route read path summary
2. pagination contract
3. verification results
