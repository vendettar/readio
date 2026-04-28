# Instruction 001b: Feed Snapshot Mapping And Retention

Execute after `001a`.

## Goal

Define how parsed feed structs are converted into bounded SQLite snapshot rows.

## Scope

- mapper layer
- canonical ordering
- recent-episode clipping
- truncation metadata
- byte estimation
- schema-evolution boundary for future retention changes

## Must

### 1. Intermediate Snapshot Type

Create a narrow in-memory snapshot model, for example:

```go
type feedSnapshot struct {
	FeedKey               string
	FeedURL               string
	Title                 string
	Description           string
	ArtworkURL            string
	StoredEpisodeCount    int
	TotalSeenEpisodeCount int
	IsTruncated           bool
	ApproxBytes           int
	ETag                  string
	LastModified          string
	LastSuccessfulFetchAt time.Time
	NextRefreshAfter      time.Time
	Episodes              []feedEpisodeSnapshot
}
```

Do not map parser structs directly into SQL parameter lists everywhere.

### 2. Ordering

Before persistence:

- sort episodes newest-first
- assign stable `sort_index`

### 3. Retention Window

Keep only the recent bounded window per feed.

Recommended first-pass default:

- `maxEpisodesPerFeed = 300`

This must be configurable.

### 4. Truncation Metadata

Compute and persist:

- `stored_episode_count`
- `total_seen_episode_count`
- `is_truncated`

### 5. Approximate Size

Estimate `approx_bytes` from stored parsed fields so later budget eviction can work.

### 6. Schema Evolution Boundary

This instruction defines feed snapshot mapping behavior, not ad hoc schema mutation.

If retention strategy later needs:
- new metadata columns
- new indexes
- new derived tables

those changes must be introduced through new backend migrations, using the same `goose` path as the rest of `apps/cloud-api`.

## Do Not

- Do not store every historical episode from huge feeds
- Do not leave ordering implicit
- Do not pretend the stored snapshot is a full archive
- Do not couple mapper behavior to lazy schema creation or on-the-fly DDL

## Tests

1. newest-first ordering is deterministic
2. clipping keeps only newest `N`
3. counts/truncation metadata are correct
4. byte estimation is stable enough for budget use

## Return

1. snapshot types
2. clipping rules
3. verification results
