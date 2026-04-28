# Instruction 001c: Feed Refresh And Conditional Fetch

Execute after `001b`.

## Goal

Implement feed-level upstream refresh semantics for the SQLite snapshot layer.

## Scope

- conditional GET
- `singleflight` refresh dedupe
- transactional snapshot replacement
- failure/backoff bookkeeping
- runtime assumption that schema is already migrated

## Must

### 1. Keep `singleflight`

Use:

- `singleflight` key = `feed:` + `feed_key`

This remains mandatory after the SQLite migration.

### 2. Conditional GET

When refresh metadata exists, send:

- `If-None-Match` from stored `etag`
- `If-Modified-Since` from stored `last_modified`

### 3. Outcome Model

Refresh service should return one of:

- `not_modified`
- `replaced_snapshot`
- `failed`

### 4. `304 Not Modified`

On `304`:

- do not rewrite episode rows
- update freshness metadata only

### 5. `200 OK`

On `200`:

- parse feed
- build bounded snapshot
- replace feed row + episode rows in one transaction

### 6. Failure Semantics

If upstream parse succeeds but DB persistence fails:

- current request may still return the parsed response
- DB failure must be logged

Track:

- `last_attempted_fetch_at`
- `last_successful_fetch_at`
- `fetch_fail_count`
- `last_error_class`
- `next_refresh_after`

### 7. Failure Backoff

Repeated failures must not hammer upstream on every request.

Use bounded backoff for `next_refresh_after`.

### 8. Schema Readiness Assumption

Refresh logic must assume the feed-cache schema has already been applied during backend startup.

That means:
- no refresh-path schema bootstrap
- no "create table if missing" fallback inside refresh logic
- persistence failures should be treated as normal DB errors, not as a signal to run DDL on demand

## Do Not

- Do not patch single episodes ad hoc
- Do not fetch upstream multiple times for the same concurrent stale miss
- Do not rewrite episode rows on `304`
- Do not hide missing-schema problems behind opportunistic runtime table creation

## Tests

1. concurrent stale misses collapse into one upstream refresh
2. `304` updates freshness only
3. `200` replaces snapshot transactionally
4. repeated failures apply bounded backoff

## Return

1. refresh service contract
2. state fields updated
3. verification results
