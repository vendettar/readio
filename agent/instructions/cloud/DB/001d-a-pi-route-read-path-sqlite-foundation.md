# Instruction 001d-a: PI Route Read Path SQLite Foundation [COMPLETED]

Execute after `001c`.

This is a Phase 4 preparatory task. It does not activate the public paginated episode-list HTTP contract.

## 1. Goal

Prepare backend SQLite-backed read-path helpers for PodcastIndex podcast detail and episode data without changing the externally consumed route contract yet.

## 2. Scope

- backend-only read-path service/helper support
- fresh snapshot reads
- `last_accessed_at` touch behavior
- SQL `LIMIT` / `OFFSET` page reads
- episode detail lookup by `podcastItunesId + episodeGuid`
- tests for backend foundation behavior

## 3. Depends On

- `001a-pi-episode-cache-sqlite-schema-and-store.md`
- `001b-pi-snapshot-mapping-and-retention.md`
- `001c-pi-refresh-freshness-and-singleflight.md`

## 4. Must

- Reuse the startup-owned `*sql.DB` and the existing PI cache store.
- Keep canonical identity:
  - podcast = `podcastItunesId`
  - episode = `podcastItunesId + episodeGuid`
- Use repository-level SQL paging:
  - `ORDER BY published_at_unix DESC, episode_guid ASC`
  - `LIMIT ? OFFSET ?`
- Touch `last_accessed_at` on successful snapshot/page reads where the future route needs access recency.
- Resolve direct episode detail from `podcast_episodes` by `podcast_itunes_id` and `episode_guid`.
- Keep the current HTTP handlers on their existing behavior during this subtask.
- Keep all helper behavior compatible with the refresh service created in `001c`.
- Add tests proving:
  - fresh cached snapshots can be read without upstream fetch
  - SQL windows are stable
  - detail lookup uses `podcastItunesId + episodeGuid`
  - missing detail lookup returns a deterministic not-found result for later route mapping
  - `last_accessed_at` changes on read/touch

## 5. Do Not

- Do not change `GET /api/v1/discovery/podcasts/:itunesId/episodes` response shape yet.
- Do not update frontend schemas or consumers in this subtask.
- Do not retain the old full-list response as a compatibility layer in any new helper.
- Do not fetch PI when a fresh SQLite snapshot can satisfy the backend helper call.
- Do not add route-local DDL or a second SQLite connection.
- Do not mark Phase 4 or Instruction `001d` complete from this subtask.

## 6. Verification

- `pnpm -C apps/cloud-api exec go test ./...`

## 7. Completion Requirement

When complete, append a `## Completion` section with:

- `Completed by`
- `Reviewed by`
- `Commands`
- `Date`
- `Integration Status: Not complete; public paginated contract not active until 001d-c.`

## Completion

- Completed by: Worker
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/cloud-api exec go test ./...`
- Date: 2026-05-18
- Integration Status: Not complete; public paginated contract not active until 001d-c.
