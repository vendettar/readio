# Instruction 001: SQLite-Backed Parsed Feed Cache Master Plan

## Objective

Move Cloud feed snapshot storage from the current tiny in-memory parsed-feed cache to a SQLite-backed parsed-feed cache in `apps/cloud-api`, without storing raw XML.

This file is now the **master plan / parent instruction**.
Implementation should be executed through the child instructions below, in order.

This master plan now inherits the repository-wide SQLite migration delivery rules pinned in:
- [023d-cloudflare-asr-sqlite-migration-plan.md](/Users/Leo_Qiu/Documents/dev/readio/agent/instructions/cloud/023d-cloudflare-asr-sqlite-migration-plan.md)

That means the feed-cache schema must follow the same backend DB discipline:
- versioned SQL migrations
- `goose` as the migration mechanism
- startup-time migration application before request serving
- no route-local or repository-local ad hoc DDL

## 1. Parent Decisions

- SQLite becomes the primary persistent cache layer for parsed feed snapshots.
- Raw XML must not be stored.
- Storage is split into:
  - one feed-level table
  - one episode-level table
- Only the most recent bounded episode window per feed is stored.
- `/api/v1/discovery/feed` should page from SQLite rows.
- Feed refresh remains feed-level and uses conditional GET when possible.
- `singleflight` remains required for concurrent refresh dedupe.
- SQLite here is a bounded cache/snapshot layer, not a canonical feed archive.
- Feed-cache schema creation and evolution must go through `apps/cloud-api/migrations/*.sql`, not bespoke bootstrap SQL.

## 2. Execution Split

Execute these child instructions in order:

1. [001a-feed-sqlite-schema-and-store.md](/Users/Leo_Qiu/Documents/dev/readio/agent/instructions/cloud/DB/001a-feed-sqlite-schema-and-store.md)
2. [001b-feed-snapshot-mapping-and-retention.md](/Users/Leo_Qiu/Documents/dev/readio/agent/instructions/cloud/DB/001b-feed-snapshot-mapping-and-retention.md)
3. [001c-feed-refresh-and-conditional-fetch.md](/Users/Leo_Qiu/Documents/dev/readio/agent/instructions/cloud/DB/001c-feed-refresh-and-conditional-fetch.md)
4. [001d-feed-route-sqlite-paging-cutover.md](/Users/Leo_Qiu/Documents/dev/readio/agent/instructions/cloud/DB/001d-feed-route-sqlite-paging-cutover.md)
5. [001e-feed-budget-eviction-and-regression-coverage.md](/Users/Leo_Qiu/Documents/dev/readio/agent/instructions/cloud/DB/001e-feed-budget-eviction-and-regression-coverage.md)

## 3. Global Boundaries

- Do not store raw XML.
- Do not store full historical feed archives.
- Do not weaken current URL validation, SSRF protection, body limits, timeout behavior, or XML sanitization.
- Do not remove `singleflight`.
- Do not silently change product semantics for malformed feeds or malformed URLs.
- Do not pretend deep pagination beyond the stored recent window is guaranteed full history.
- Do not create or evolve feed-cache tables through scattered `CREATE TABLE IF NOT EXISTS` calls.
- Do not let tests rely on a schema path that production startup does not execute.

## 4. Target Architecture

- `cloud_feeds`: feed-level parsed snapshot metadata
- `cloud_feed_episodes`: bounded recent episode rows
- request-time route lookup:
  - validate URL
  - derive canonical `feed_key`
  - read fresh snapshot from SQLite if available
  - otherwise refresh upstream through `singleflight`
- pagination:
  - `LIMIT/OFFSET` over `cloud_feed_episodes`
- refresh:
  - conditional GET using stored `etag` / `last_modified`
  - transactional replace of the bounded snapshot

## 5. Final Product Boundary

After all child instructions land:

- Cloud feed requests should primarily reuse SQLite-backed parsed snapshots
- VPS disk should carry the main feed cache burden
- only a bounded recent window per feed should be retained
- storage budget and eviction rules should keep the DB bounded
- feed-cache tables and indexes should be fully reproducible from versioned migrations and startup application alone

## 6. Return

1. child instructions created
2. execution order
3. major boundaries preserved
