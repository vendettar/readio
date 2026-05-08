# Instruction 001c: PI Refresh, Freshness, And Singleflight

Discuss and approve this document before implementation.

Note:
- this instruction replaces the old RSS conditional-fetch idea with PI JSON refresh semantics

Execute after `001b`.

## 1. Goal

Implement PI upstream refresh semantics for the SQLite snapshot layer.

## 2. Scope

- freshness TTL
- `singleflight` refresh dedupe
- transactional snapshot replacement
- failure and backoff bookkeeping

## 3. Must

### 3.1 Keep `singleflight`

Use:

- `singleflight` key = `pi-episodes:` + `podcast_itunes_id`

This remains mandatory after the local-cache cutover.

### 3.2 Refresh Unit

The refresh unit is one canonical podcast identity.

A refresh cycle must fetch:

1. `podcasts/byitunesid`
2. `episodes/byitunesid?max=1000`

The cache must not treat these as feed-keyed refreshes.

### 3.3 Outcome Model

Refresh service should return one of:

- `cache_hit`
- `replaced_snapshot`
- `failed`

### 3.4 Freshness Contract

Use explicit freshness timestamps instead of RSS conditional headers.

Required fields:

- `last_attempted_fetch_at`
- `last_successful_fetch_at`
- `next_refresh_after`
- `fetch_fail_count`
- `last_error_class`

The first implementation may use a simple TTL model such as:

- fresh window for hot reads
- stale-while-refresh for expired entries
- bounded retry backoff on repeated failures

### 3.5 Success Semantics

On successful upstream refresh:

- validate PI response status and required payload shape
- build bounded snapshot rows
- replace podcast row and episode rows in one transaction
- reset failure counters

### 3.6 Failure Semantics

If upstream fetch succeeds but DB persistence fails:

- current request may still return the freshly fetched in-memory response
- DB failure must be logged

If upstream fetch fails and a stale snapshot exists:

- the route may choose to serve stale data if product policy explicitly allows it
- if stale serving is allowed, the response should still be logged as stale

If no usable snapshot exists:

- fail closed with the normal discovery error mapping

### 3.7 Schema Readiness Assumption

Refresh logic must assume the cache schema was already applied during backend startup.

That means:

- no refresh-path schema bootstrap
- no `create table if missing` fallback
- persistence failures are normal DB failures, not a signal to run DDL

## 4. Do Not

- Do not fetch upstream multiple times for the same concurrent stale miss
- Do not use `If-None-Match` or `If-Modified-Since` as if this were still the RSS path
- Do not patch single episode rows ad hoc outside the canonical snapshot replace flow
- Do not hide missing-schema problems behind runtime table creation

## 5. Tests

1. concurrent stale misses collapse into one upstream refresh
2. successful refresh replaces the snapshot transactionally
3. repeated failures apply bounded backoff
4. stale-serving policy behaves deterministically when enabled
5. refresh uses `podcastItunesId`, never legacy feed transport metadata, as the dedupe key

## 6. Return

1. refresh service contract
2. state fields updated
3. verification results
