# Instruction 001d: Feed Route SQLite Paging Cutover

Execute after `001c`.

## Goal

Move `/api/v1/discovery/feed` to read fresh snapshots from SQLite and serve `limit/offset` directly from DB paging.

## Scope

- route read path
- DB-backed page assembly
- access timestamp updates
- request contract preservation
- startup-migrated schema dependency

## Must

### 1. Read Path

For `GET /api/v1/discovery/feed`:

1. validate and normalize input URL
2. derive `feed_key`
3. attempt fresh SQLite snapshot read
4. if hit:
   - update `last_accessed_at`
   - page from `cloud_feed_episodes`
   - return feed response
5. if miss/stale:
   - refresh through `singleflight`
   - persist snapshot
   - return page from new snapshot

### 2. SQL Paging

Use SQL paging:

- `ORDER BY sort_index ASC`
- `LIMIT ? OFFSET ?`

Do not load all stored episodes just to slice in Go when SQL can answer directly.

### 3. Product Boundary

Because only the stored recent window exists:

- deep offsets page over the stored snapshot window, not guaranteed full history

If possible, extend page metadata with fields such as:

- `storedTotal`
- `isTruncated`

If response shape is not extended immediately, document the boundary explicitly.

### 4. Preserve Existing Safety

The route cutover must preserve:

- URL validation
- SSRF protection
- timeout behavior
- XML sanitization and parse behavior on refresh path
- current feed error mapping

### 5. Schema Dependency

The route must rely on startup-applied migrations, not lazy schema setup.

Required rules:

- assume `cloud_feeds` / `cloud_feed_episodes` already exist before the route serves traffic
- do not execute feed-cache DDL from request handlers
- do not "repair" missing schema by creating tables on first request
- missing-schema conditions should surface as startup/migration defects, not route-local self-healing behavior

## Do Not

- Do not silently fetch upstream when a fresh SQLite snapshot can satisfy the request
- Do not weaken malformed URL / malformed XML behavior
- Do not fake full history semantics when only a bounded snapshot exists
- Do not couple route success to any on-demand schema bootstrap

## Tests

1. fresh DB hit returns without upstream fetch
2. SQL `limit/offset` windows are stable
3. stale/miss path refreshes and returns expected page
4. page metadata remains coherent under truncation
5. integration-style route tests run against the migrated schema path used by startup

## Return

1. route read path summary
2. pagination contract
3. verification results
