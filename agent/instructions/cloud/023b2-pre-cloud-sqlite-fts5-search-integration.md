# Instruction 023b2-pre: Cloud SQLite FTS5 Search Integration

Discuss and approve this document before implementation.

This instruction defines the design for integrating SQLite FTS5 into Cloud search flows for Readio.

It is a pre-implementation design document. It does not itself apply migrations or modify runtime behavior.

## Execution Metadata

- Recommended Order: `023a` -> `023b2-pre` -> implementation migration/integration work
- Depends On:
  - `023a-cloud-backend-sqlite-goose-foundation.md`
- Can Run In Parallel: yes, with non-conflicting docs/design work only
- Decision Log: required during implementation review
- Bilingual Sync: not required for pre-instruction draft

## Scope

`023b2-pre` is a search-infrastructure design instruction.

It owns:

- SQLite FTS5 integration design for podcast search
- base table plus FTS virtual table shape
- trigger-based synchronization design
- goose migration content design
- backend query pattern guidance for MATCH / BM25 / prefix search
- performance and indexing guidance for 1C1G deployment constraints

It does not own:

- immediate implementation
- frontend search UI behavior
- transcript ingestion pipeline
- ASR transcript indexing implementation
- ranking product policy beyond core FTS relevance ordering
- remote third-party search replacement or coexistence strategy

## 1. Purpose

Readio needs fast, low-latency text search for:

- podcast subscriptions / local podcast catalog now
- ASR transcript search later

The current design target is a single-node SQLite-backed backend on a 1C1G VPS, where CPU efficiency matters more than minimizing disk usage.

Required product rule for this instruction:

- local text search should use SQLite FTS5 rather than `%LIKE%` scans
- search architecture should be extensible to transcript indexing later
- schema and query patterns should remain compatible with `modernc.org/sqlite`

## 2. Why FTS5

SQLite FTS5 is the correct baseline for this environment because it provides:

- inverted index lookup instead of full table scan
- built-in tokenization
- native relevance ranking via `bm25()`
- efficient prefix matching for search-as-you-type
- no extra service dependency such as Elasticsearch / Meilisearch / Typesense

Why FTS5 is better than `LIKE` on 1C1G:

- `LIKE '%term%'` forces broad scans and scales poorly as rows grow
- FTS5 shifts work to indexed token lookup, reducing repeated CPU-heavy scans
- SQLite keeps the search stack embedded and operationally simple
- CPU on a 1-core machine is more constrained than local disk for this use case, so spending some disk on an index is the right trade

## 3. High-Level Design

The first FTS5 integration should index podcasts through:

- a normal content table: `podcasts`
- an FTS5 virtual table: `podcasts_fts`
- sync triggers on insert / update / delete

Recommended search ownership:

- authoritative record storage remains in `podcasts`
- search index lives in `podcasts_fts`
- result rendering joins back to `podcasts`
- FTS table is not treated as the canonical source of podcast metadata

Canonical table interpretation rule:

- `podcasts` in this instruction is the canonical content-table role required by FTS design, not necessarily proof that the runtime must introduce a brand-new redundant table
- if the existing Cloud SQLite schema already contains a semantically equivalent backend-owned podcast content table with stable row identity and the required searchable columns, implementation should prefer reusing or adapting that table rather than creating unnecessary duplication
- if no such equivalent table exists, implementation may introduce a dedicated `podcasts` table following this contract
- implementation review must explicitly state which path was chosen:
  - reuse/adapt an existing canonical content table
  - introduce a new dedicated `podcasts` table

## 4. Database Schema Design

### 4.1 Base content table

Use a normal SQLite table for canonical podcast records:

```sql
CREATE TABLE podcasts (
  id INTEGER PRIMARY KEY,
  itunes_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  feed_url TEXT NOT NULL UNIQUE
);
```

Column rationale:

- `id`: stable row identifier used by the FTS external content linkage
- `itunes_id`: business identity for Apple-derived shows
- `title`: highest-value search field
- `description`: lower-value secondary searchable field
- `feed_url`: canonical feed locator; not necessary to index in FTS initially

### 4.2 FTS virtual table

Use an FTS5 virtual table with external content:

```sql
CREATE VIRTUAL TABLE podcasts_fts USING fts5(
  title,
  description,
  content = 'podcasts',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);
```

Design choices:

- `content='podcasts'`: keeps canonical data in the base table
- `content_rowid='id'`: uses the base table row identity directly
- `unicode61 remove_diacritics 2`: good default for multilingual text normalization and accent-insensitive matching

Initial indexing strategy:

- index `title`
- index `description`
- do not index `feed_url` in FTS for v1
- do not index `itunes_id` in FTS for v1; exact lookup should remain a normal indexed column lookup if needed

### 4.3 Sync triggers

Use triggers to keep `podcasts_fts` synchronized with `podcasts`.

#### AFTER INSERT

```sql
CREATE TRIGGER podcasts_ai AFTER INSERT ON podcasts BEGIN
  INSERT INTO podcasts_fts(rowid, title, description)
  VALUES (new.id, new.title, COALESCE(new.description, ''));
END;
```

#### AFTER DELETE

```sql
CREATE TRIGGER podcasts_ad AFTER DELETE ON podcasts BEGIN
  INSERT INTO podcasts_fts(podcasts_fts, rowid, title, description)
  VALUES ('delete', old.id, old.title, COALESCE(old.description, ''));
END;
```

#### AFTER UPDATE

```sql
CREATE TRIGGER podcasts_au AFTER UPDATE ON podcasts BEGIN
  INSERT INTO podcasts_fts(podcasts_fts, rowid, title, description)
  VALUES ('delete', old.id, old.title, COALESCE(old.description, ''));

  INSERT INTO podcasts_fts(rowid, title, description)
  VALUES (new.id, new.title, COALESCE(new.description, ''));
END;
```

Why this shape:

- this is the standard external-content FTS5 maintenance pattern
- update is modeled as delete + insert into the FTS index
- `COALESCE` avoids null text instability inside the FTS payload

## 5. Goose Migration Design

The requested migration file content should be:

Path:

```text
apps/cloud-api/migrations/00002_add_fts5_search.sql
```

Migration numbering rule:

- `00002_add_fts5_search.sql` is an example file name only for this design document
- real implementation must use the next valid goose migration version in the repository at execution time
- execution must not reuse or force `00002` if that version number is already occupied
- implementation report must include the actual migration filename chosen

Recommended content:

```sql
-- +goose Up

CREATE TABLE podcasts (
  id INTEGER PRIMARY KEY,
  itunes_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  feed_url TEXT NOT NULL UNIQUE
);

CREATE VIRTUAL TABLE podcasts_fts USING fts5(
  title,
  description,
  content = 'podcasts',
  content_rowid = 'id',
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER podcasts_ai AFTER INSERT ON podcasts BEGIN
  INSERT INTO podcasts_fts(rowid, title, description)
  VALUES (new.id, new.title, COALESCE(new.description, ''));
END;

CREATE TRIGGER podcasts_ad AFTER DELETE ON podcasts BEGIN
  INSERT INTO podcasts_fts(podcasts_fts, rowid, title, description)
  VALUES ('delete', old.id, old.title, COALESCE(old.description, ''));
END;

CREATE TRIGGER podcasts_au AFTER UPDATE ON podcasts BEGIN
  INSERT INTO podcasts_fts(podcasts_fts, rowid, title, description)
  VALUES ('delete', old.id, old.title, COALESCE(old.description, ''));

  INSERT INTO podcasts_fts(rowid, title, description)
  VALUES (new.id, new.title, COALESCE(new.description, ''));
END;

INSERT INTO podcasts_fts(rowid, title, description)
SELECT id, title, COALESCE(description, '')
FROM podcasts;

-- +goose Down

DROP TRIGGER podcasts_au;
DROP TRIGGER podcasts_ad;
DROP TRIGGER podcasts_ai;
DROP TABLE podcasts_fts;
DROP TABLE podcasts;
```

## 6. Backend Query Patterns in Go

### 6.1 Basic MATCH query

Recommended pattern:

- query `podcasts_fts`
- join back to `podcasts`
- rank using `bm25(podcasts_fts)`
- order by score ascending, because smaller BM25 is better in SQLite FTS5

Example:

```go
type PodcastSearchRow struct {
	ID          int64
	ItunesID    string
	Title       string
	Description string
	FeedURL     string
	Rank        float64
}

func searchPodcasts(ctx context.Context, db *sql.DB, rawQuery string, limit int) ([]PodcastSearchRow, error) {
	query := strings.TrimSpace(rawQuery)
	if query == "" {
		return []PodcastSearchRow{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := db.QueryContext(ctx, `
		SELECT
			p.id,
			p.itunes_id,
			p.title,
			COALESCE(p.description, ''),
			p.feed_url,
			bm25(podcasts_fts, 5.0, 1.0) AS rank
		FROM podcasts_fts
		JOIN podcasts p ON p.id = podcasts_fts.rowid
		WHERE podcasts_fts MATCH ?
		ORDER BY rank ASC, p.id DESC
		LIMIT ?
	`, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]PodcastSearchRow, 0, limit)
	for rows.Next() {
		var row PodcastSearchRow
		if err := rows.Scan(
			&row.ID,
			&row.ItunesID,
			&row.Title,
			&row.Description,
			&row.FeedURL,
			&row.Rank,
		); err != nil {
			return nil, err
		}
		results = append(results, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return results, nil
}
```

### 6.2 BM25 weighting guidance

Use weighted BM25 so `title` matters more than `description`.

Example:

```sql
bm25(podcasts_fts, 5.0, 1.0)
```

Interpretation:

- `title` weight = `5.0`
- `description` weight = `1.0`

Recommendation:

- start with strong title bias
- do not over-weight description on 1C1G unless product testing proves it improves relevance
- title hits should dominate short-query ranking

### 6.3 Search-as-you-type with `*`

FTS5 supports prefix queries using `*`.

Examples:

- `news*`
- `daily*`
- `tech* podcast*`

Do not blindly append `*` to the raw user string. Instead:

- tokenize input
- trim whitespace
- append `*` only to the last token for incremental search
- reject or sanitize special FTS operators if not intentionally supported

Restricted-query rule for v1:

- v1 does not expose arbitrary raw FTS5 MATCH syntax to end-user input
- backend must treat user search text as plain search terms, not as trusted FTS expressions
- user input must be normalized into a restricted token query before being used in `MATCH`
- advanced operators such as unbalanced quotes, explicit boolean operators, `NEAR`, column filters, or parenthesized expressions are out of scope unless a later instruction explicitly enables them
- if normalization yields an empty or invalid FTS query, backend should return an empty result set or another controlled non-fatal outcome; it must not leak raw SQLite FTS parser errors as product behavior

Example helper:

```go
func buildPrefixMatchQuery(raw string) string {
	parts := strings.Fields(strings.TrimSpace(raw))
	if len(parts) == 0 {
		return ""
	}

	for i := range parts {
		parts[i] = sanitizeFTSToken(parts[i])
	}
	if parts[len(parts)-1] != "" {
		parts[len(parts)-1] = parts[len(parts)-1] + "*"
	}

	filtered := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			filtered = append(filtered, p)
		}
	}
	return strings.Join(filtered, " ")
}
```

Example sanitizer:

```go
var ftsSpecialChars = strings.NewReplacer(
	`"`, "",
	`'`, "",
	`(`, "",
	`)`, "",
	`:`, "",
)

func sanitizeFTSToken(s string) string {
	return strings.TrimSpace(ftsSpecialChars.Replace(s))
}
```

Why only last token gets `*`:

- reduces unnecessary expansion work
- matches user typing behavior
- keeps query cost more stable

## 7. Query Modes

Recommended query modes for v1:

### 7.1 Exact-ish token search

Use plain MATCH:

```sql
WHERE podcasts_fts MATCH ?
```

Example query:

```text
daily news
```

### 7.2 Search-as-you-type

Use last-token prefix expansion:

```text
daily new*
```

### 7.3 Exact field filter

Do not use FTS for exact `itunes_id` or `feed_url` matching.

Use normal SQL:

```sql
SELECT id, itunes_id, title, description, feed_url
FROM podcasts
WHERE itunes_id = ?
LIMIT 1;
```

## 8. Performance and Resource Considerations

### 8.1 Why this is efficient on 1C1G

FTS5 is the right choice because:

- CPU avoids repeated full-string scans
- data remains embedded in one SQLite database
- no sidecar search service consumes extra RAM
- relevance ranking is native, not application-reconstructed

Expected trade:

- more disk than plain base table
- significantly less CPU per search than `%LIKE%`
- much better latency as row count grows

### 8.2 Indexing strategy

Recommended v1 strategy:

- index `title`
- index `description`
- bias ranking heavily toward `title`
- keep exact identifiers out of FTS
- avoid over-indexing low-value columns

Why:

- title is the dominant user intent field
- description helps recall, but is noisier
- extra indexed columns increase index size and token volume

### 8.3 Tokenizer choice

Use:

```text
tokenize = 'unicode61 remove_diacritics 2'
```

Reason:

- broad Unicode support
- accent-insensitive matching
- good general-purpose default without custom extension complexity

Do not introduce custom tokenizers in v1.

### 8.4 Large description caution

Descriptions can be long. On a small VPS:

- long descriptions increase index size
- long descriptions increase token count
- long descriptions can add noise to ranking

Recommendation:

- keep full description indexing in v1 only if product needs broad recall
- if index size or relevance degrades, next step should be description truncation at ingestion or moving description to lower-weight indexing policy
- do not prematurely optimize this before measuring

## 9. Future Transcript Search Extension

This design should be treated as the base pattern for transcript FTS later.

Expected future shape:

- transcript content table
- transcript FTS table
- trigger sync or controlled write-path sync
- title/show metadata joined for result rendering
- transcript snippets generated from FTS results

But v1 should not mix podcast metadata FTS and transcript FTS into one table.

Keep them separate because:

- different row cardinality
- different text volume
- different ranking semantics
- different query products

## 10. Implementation Guidance

When this instruction is later executed:

- confirm `modernc.org/sqlite` build enables FTS5 in the current project environment
- add migration under existing `023a` goose migration path
- add repository/query functions behind backend-owned search APIs
- add tests for trigger sync, ranking, and prefix search
- measure query latency before adding more indexed fields

## 11. Acceptance Criteria

A later implementation following this instruction should prove:

- SQLite schema contains a canonical `podcasts` table and a synchronized `podcasts_fts` table
- insert / update / delete on `podcasts` keep FTS rows in sync
- backend can execute MATCH queries through Go
- search results can be ordered by BM25 relevance
- search-as-you-type can be supported through last-token `*` expansion
- the design remains SQLite-native and operationally simple on 1C1G

## 12. Required Tests

A later implementation should include at minimum:

- migration test proving FTS table and triggers are created
- insert sync test
- update sync test
- delete sync test
- basic MATCH query test
- BM25 ordering test with title-biased weighting
- prefix query test using `*`
- empty-query handling test
- exact `itunes_id` lookup test outside FTS
- regression test proving null descriptions do not break sync

## 13. Verification Commands

For the later implementation phase:

- `pnpm -C apps/cloud-api exec go test ./...`
- `git diff --check`

## 14. Return

Implementation following this instruction should report:

1. final migration content
2. FTS table and trigger shape
3. backend query helper design
4. BM25 weighting choice
5. prefix-query behavior
6. verification results

## 15. Notes

This is a design instruction only.

It should not be implemented by directly replacing product search behavior without first deciding:

- whether the `podcasts` table becomes the full local subscription catalog or a broader searchable catalog subset
- whether description indexing should be full-text complete or trimmed
- whether transcript FTS will reuse the same route family or live behind separate APIs

## Suggested File Path

If you want this saved under your requested numbering scheme, use:

```text
agent/instructions/cloud/023b2-pre-cloud-sqlite-fts5-search-integration.md
```
