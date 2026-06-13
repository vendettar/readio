# Instruction 00003a: Podcast Cache FTS5 Backend Search

Discuss and approve this document before implementation.

This instruction implements the backend-only part of PodcastIndex cache FTS search.

Status: Implemented on 2026-06-11.

## Execution Metadata

- Decision Log: Required
- Bilingual Sync: Not applicable
- Pre-Implementation 8-Scope Scan: Required
- Reviewer Evidence Surface: Required

## Decision Log

- 2026-06-11: Public backend route is `GET /api/v1/discovery/search/cache?term=<query>&limit=<n>`, returning separate cached podcast and cached episode arrays.
- 2026-06-11: Query sanitizer uses strict AND/prefix syntax. A multi-token query such as `syntax vector` is emitted as `syntax* vector*`; `OR` recall semantics are not allowed for 00003a.
- 2026-06-11: Store search uses bound raw SQL for FTS5 table-level `MATCH ?`, because sqlc does not reliably support SQLite FTS5 table-level `MATCH` while preserving bound query parameters and generated types.
- 2026-06-11: FTS row identity uses mapping tables from stable canonical keys to FTS `rowid`; joins back from FTS use `rowid -> mapping.id`, not `UNINDEXED` text columns.
- 2026-06-11: Migration backfill SQL remains in `00003`, but explicit legacy 00002 production-data compatibility testing is waived for 00003a because this deployment is still pre-launch and has no production 00002 cache data.
- 2026-06-11: FTS shadow storage is not counted in `podcast_cache_state.approx_bytes`; operators must monitor SQLite file/page size for total DB storage.
- 2026-06-12: `podcast_shows` update triggers are narrowed to search-field updates. Show FTS refreshes only on `title`, `author`, `description`, or `categories_json`; episode denormalized show fields refresh only on `title` or `author`.

## 1. Goal

Add SQLite FTS5 indexes and a public cached-search API over already-cached PodcastIndex show and episode rows.

This instruction owns backend schema, synchronization, query safety, API contract, security limits, and backend tests.

## 2. Scope

Owns:

- next goose migration after the current repository head
- `apps/cloud-api/internal/db/schema.sql`
- `apps/cloud-api/internal/db/queries/...`
- generated sqlc code
- `apps/cloud-api/internal/podcastindex` store/search methods
- `apps/cloud-api/internal/discovery` route wiring and handlers
- backend tests

Does not own:

- Cloud UI integration
- docs handoff updates
- Apple Search API behavior
- transcript or ASR FTS

## 3. API Contract

Add one explicit GET route:

```text
GET /api/v1/discovery/search/cache?term=<query>&limit=<n>
```

The route returns both cached podcast and cached episode result arrays:

```json
{
  "podcasts": [],
  "episodes": [],
  "limit": 5
}
```

Query params:

- `term`: optional string; missing, empty, or fewer than 2 Unicode runes after trimming returns `200` with empty arrays
- `term` longer than `256` raw bytes returns `400`; do not truncate and search a partial term
- `limit`: optional integer, default `5`, min `1`, max `10`
- `limit` is per result kind: `limit=5` means at most 5 cached podcasts and at most 5 cached episodes

Response fields for each cached podcast:

- `podcastItunesId`
- `title`
- `author`
- `description`
- `image`
- `resultSource`: always `"cache"`

Response fields for each cached episode:

- `podcastItunesId`
- `episodeGuid`
- `title`
- `podcastTitle`
- `description`
- `image`
- `publishedAtUnix`
- `durationSeconds`
- `resultSource`: always `"cache"`

Episode image rule:

- response `image` uses episode image first
- if episode image is empty, fallback to the owning show image
- if both are empty, return an empty string

Error shape must use the existing discovery error helper shape. Invalid `limit` returns `400`. FTS syntax failures from user input must not return `500`; after sanitizer processing they return `200` with empty arrays.

Router rules:

- add a static route constant for `/api/v1/discovery/search/cache`
- add the route to the explicit discovery switch
- metrics must record the static route name, not the raw URL

## 4. Security And Public Surface

This route is public discovery surface. It must define:

- reuse the existing discovery search rate limiter with the same client-IP extraction path
- request-scoped DB timeout: `2s`
- max raw query bytes: `256`
- max accepted tokens: `8`
- max limit: `10`
- no raw query text in logs, metrics, traces, span names, or error bodies
- no return fields from `podcast_cache_state`

Public enumeration is acceptable only within the above limits because the API reveals cached public podcast metadata. Do not expose cache freshness, access time, eviction priority, failure state, approximate bytes, or refresh timings.

FTS storage decision:

- 00003a must not change the existing canonical cache budget semantics.
- `podcast_cache_state.approx_bytes` remains an estimate of retained canonical snapshot data, not FTS shadow/index storage.
- FTS storage amplification is accepted for this instruction, but the implementation report must record a size observation before/after representative cache rows using available SQLite/file-size signals.
- Do not use FTS table size to evict individual podcasts in 00003a. A future budget instruction may add full SQLite file-size governance if needed.

## 5. FTS Schema

Create FTS5 virtual tables with explicit unindexed identity columns. Do not depend on implicit canonical table `rowid`.

Recommended shape:

```sql
CREATE VIRTUAL TABLE podcast_shows_fts USING fts5(
  podcast_itunes_id UNINDEXED,
  title,
  author,
  description,
  categories,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE podcast_episodes_fts USING fts5(
  podcast_itunes_id UNINDEXED,
  episode_guid UNINDEXED,
  title,
  description,
  podcast_title,
  podcast_author,
  tokenize = 'unicode61 remove_diacritics 2'
);
```

Implementation may add supporting non-FTS indexes if needed for joins or cleanup.

Category indexing rule:

- `categories` is indexed from `podcast_shows.categories_json` after JSON parsing.
- Only JSON arrays are accepted as category input.
- If `categories_json` is empty, cannot be parsed, or is not a JSON array, index empty category text.
- Cached search responses must not return a category field in 00003a.

### 5.1 FTS Row Identity

Ordinary FTS5 tables do not enforce uniqueness over `UNINDEXED` identity columns. Therefore implementation must not rely on `podcast_itunes_id` or `podcast_itunes_id + episode_guid` being unique inside the FTS virtual table by themselves.

Use explicit mapping tables to own FTS row identity:

```sql
CREATE TABLE podcast_shows_fts_index (
  id INTEGER PRIMARY KEY,
  podcast_itunes_id TEXT NOT NULL UNIQUE,
  FOREIGN KEY (podcast_itunes_id)
    REFERENCES podcast_shows(podcast_itunes_id)
    ON DELETE CASCADE
);

CREATE TABLE podcast_episodes_fts_index (
  id INTEGER PRIMARY KEY,
  podcast_itunes_id TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  UNIQUE (podcast_itunes_id, episode_guid),
  FOREIGN KEY (podcast_itunes_id, episode_guid)
    REFERENCES podcast_episodes(podcast_itunes_id, episode_guid)
    ON DELETE CASCADE
);
```

Required mutation strategy:

- insert/update show: allocate or reuse `podcast_shows_fts_index.id`, delete the old FTS row by `rowid = id`, then insert the new FTS row with `rowid = id`
- delete show: delete the FTS row by mapped `id`, then remove the mapping row
- insert/update episode: allocate or reuse `podcast_episodes_fts_index.id`, delete the old FTS row by `rowid = id`, then insert the new FTS row with `rowid = id`
- delete episode: delete the FTS row by mapped `id`, then remove the mapping row
- bulk stale cleanup: delete FTS rows through mapping rowids before or in the same transaction as mapping cleanup

This rowid belongs to the FTS mapping layer only. It must not become a public identity and must not replace `podcast_itunes_id` or `podcast_itunes_id + episode_guid` in route/API contracts.

Deletion ordering rule:

- the implementation must delete FTS virtual-table rows before the mapping row that holds their `id` is removed
- use `BEFORE DELETE` triggers or explicit store transaction cleanup for delete/prune/evict paths
- do not rely on `ON DELETE CASCADE` alone to clean FTS virtual-table rows, because cascade can remove the mapping row before the FTS rowid is available

## 6. Synchronization Contract

Preferred strategy: SQLite triggers plus migration-time backfill.

Required trigger/store behavior:

- insert/update/delete on `podcast_shows` updates `podcast_shows_fts`
- insert/update/delete on `podcast_episodes` updates `podcast_episodes_fts`
- all FTS updates use the mapping-table `id` delete-then-insert strategy from section 5.1
- show delete removes all FTS rows for that `podcast_itunes_id`
- cold replacement removes stale episode FTS rows
- incremental upsert makes new or updated episodes searchable
- retention prune removes pruned episode FTS rows
- show eviction cascade removes show and episode FTS rows
- if episode FTS duplicates show title/author, show metadata update refreshes all episode FTS rows for that show

If triggers cannot cover a write path reliably, use store-maintained FTS writes for that path and document why.

## 7. Query Safety

Do not pass raw user text directly to `MATCH`.

Define a helper that:

- trims and normalizes whitespace
- tokenizes only Unicode letters, marks, and numbers
- treats all punctuation and symbols as token separators
- removes unsupported FTS operators instead of preserving operator semantics
- treats quotes, colon, hyphen, unmatched parens, `NEAR`, and bare `*` as non-operator input
- caps raw bytes and token count
- emits a simple AND/prefix query from sanitized tokens
- applies prefix matching only to tokens with at least 2 Unicode runes
- returns an empty result set when sanitization leaves no accepted tokens
- handles CJK, emoji, and diacritics without panics

All SQL values must remain bound parameters. Escaping is still required because `MATCH` parses its string operand.

## 8. Ranking

Use `bm25()` or an equivalent stable rank expression.

Ranking must prefer:

1. title matches
2. podcast title/author matches for episode results
3. description matches
4. newest episode tie-breaker for episodes
5. stable identity tie-breaker

Do not introduce global mixed-source ranking with Apple results in this instruction.

## 9. Backend Tests

Required tests:

- clean migration up/down/up
- migration backfills FTS from existing cached rows
  - Waived for 00003a acceptance on 2026-06-11: this deployment is still pre-launch and has no production 00002 cache data to migrate. The migration retains backfill SQL, but explicit 00002-to-00003 legacy fixture coverage is not required before 00003b.
- cold replacement makes new titles searchable
- cold replacement removes stale episode titles
- incremental refresh makes new episodes searchable
- retention prune removes pruned episode rows from FTS
- show eviction removes show and episode FTS rows
- show metadata update refreshes duplicated episode show fields
- FTS mapping tables have no orphan rows after cold replacement, incremental refresh, retention prune, or eviction
- special queries do not return `500`: quotes, colon, hyphen, `NEAR`, `*`, unmatched parens, CJK, emoji, diacritics
- empty and too-short queries return empty arrays
- invalid limit returns `400`
- result rows join back to canonical tables and expose stable identities
- FTS miss does not call PodcastIndex upstream
- logs/metrics/spans do not contain raw query text
- implementation report records FTS storage amplification observation

## 10. Verification

Run:

```bash
pnpm -C apps/cloud-api exec go generate ./internal/db
pnpm -C apps/cloud-api exec go test ./...
```

Implementation report must include:

1. actual migration filename
2. final FTS table shape
3. sync strategy: triggers, store-maintained writes, or mixed
4. API route and response shape
5. query sanitizer rules
6. FTS storage amplification observation
7. verification command results

### 10.1 Implementation Report

Implementation date: 2026-06-11.

Actual migration filename:

- `apps/cloud-api/migrations/00003_podcast_cache_fts5_backend_search.sql`

Final FTS table shape:

- `podcast_shows_fts`: FTS5 table with `podcast_itunes_id UNINDEXED`, `title`, `author`, `description`, `categories`, `unicode61 remove_diacritics 2`.
- `podcast_episodes_fts`: FTS5 table with `podcast_itunes_id UNINDEXED`, `episode_guid UNINDEXED`, `title`, `description`, `podcast_title`, `podcast_author`, `unicode61 remove_diacritics 2`.
- `podcast_shows_fts_index`: mapping table from stable `podcast_itunes_id` to FTS `rowid`.
- `podcast_episodes_fts_index`: mapping table from stable `(podcast_itunes_id, episode_guid)` to FTS `rowid`.

Sync strategy:

- SQLite triggers maintain FTS rows for show and episode insert/update/delete.
- Updates use mapping-table identity and delete-then-insert into FTS.
- Show FTS updates run only when `title`, `author`, `description`, or `categories_json` changes.
- Denormalized episode `podcast_title` and `podcast_author` refresh only when show `title` or `author` changes.
- Show deletes and cache eviction cascade remove show and episode FTS/mapping rows.
- Cold replacement, incremental upsert, retention prune, and eviction are covered through canonical table writes plus triggers.

API route and response shape:

- `GET /api/v1/discovery/search/cache?term=<query>&limit=<n>`
- Returns `{ "podcasts": [], "episodes": [], "limit": n }`.
- Podcast results expose `podcastItunesId`, `title`, `author`, `description`, `image`, `resultSource: "cache"`.
- Episode results expose `podcastItunesId`, `episodeGuid`, `title`, `podcastTitle`, `description`, `image`, `publishedAtUnix`, `durationSeconds`, `resultSource: "cache"`.

Query sanitizer rules:

- Raw API term over 256 bytes returns `400`.
- Store direct calls over 256 bytes return empty results.
- Sanitizer trims, accepts only Unicode letters/marks/numbers, treats punctuation and symbols as separators, drops tokens shorter than 2 runes, deduplicates tokens, caps accepted tokens at 8, and emits AND/prefix syntax such as `syntax* vector*`.
- Multi-token search is enforced by SQLite FTS5 table-level `MATCH ?`, which allows AND semantics across indexed columns without per-token candidate truncation. All user input remains a bound SQL parameter.

FTS storage amplification observation:

- FTS shadow tables duplicate show title/author/description/categories and episode title/description plus denormalized show title/author.
- This storage is intentionally not included in `podcast_cache_state.approx_bytes`; cache eviction remains based on canonical cache payload size.
- Representative pre-launch fixture: 10 shows and 100 episodes measured by `PRAGMA page_count * page_size` used 114,688 bytes before applying 00003 and 258,048 bytes after FTS migration/backfill, for an observed FTS/schema amplification signal of 143,360 bytes on that fixture.
- Operational follow-up for 00003c: document that SQLite file size includes FTS shadow data and monitor total DB file size rather than relying on `approx_bytes` alone.

Verification command results:

```bash
pnpm -C apps/cloud-api exec go generate ./internal/db
pnpm -C apps/cloud-api exec go test ./internal/podcastindex -run 'TestPIEpisodeCacheSearch' -count=1
pnpm -C apps/cloud-api exec go test ./internal/podcastindex ./internal/discovery ./internal/observability
pnpm -C apps/cloud-api exec go test ./...
```

All commands passed after implementation.

## 11. Pre-Implementation 8-Scope Scan

Before coding, scan and report the exact intended touch points for:

1. migration files
2. sqlc schema/query files
3. generated db code
4. podcastindex store/search code
5. discovery route/handler code
6. backend observability/rate-limit code
7. backend tests
8. docs/lifecycle impact deferred to 00003c

If the scan predicts more than 10 files for 00003a, stop unless the user explicitly approves proceeding with the larger single-pass implementation. This instruction has user approval to proceed as one controlled backend pass.

## 12. Reviewer Evidence Surface

Reviewers must inspect:

- migration up/down/up behavior
- FTS mapping-table rowid lifecycle
- delete-then-insert correctness for updates
- no stale or orphan FTS rows
- query sanitizer behavior and tests
- public API response shape and status codes
- rate-limit, timeout, and privacy behavior
- no PodcastIndex upstream call on FTS miss
- verification command output
