# Instruction 001b: PI Snapshot Mapping And Retention

Discuss and approve this document before implementation.

Note:
- this instruction maps PI JSON responses into the local cache

Execute after `001a`.

## 1. Goal

Define how `podcasts/byitunesid` and `episodes/byitunesid` responses are converted into bounded SQLite snapshot rows.

## 2. Scope

- mapper layer
- canonical ordering
- fixed retention window
- truncation metadata
- approximate size estimation

## 3. Must

### 3.1 Intermediate Snapshot Types

Create narrow in-memory snapshot models before persistence, for example:

```go
type piPodcastSnapshot struct {
	PodcastItunesID       string
	Title                 string
	Description           string
	Author                string
	Image                 string
	StoredEpisodeCount    int
	IsTruncated           bool
	ApproxBytes           int
	LastSuccessfulFetchAt time.Time
	NextRefreshAfter      time.Time
	Episodes              []piEpisodeSnapshot
}
```

Do not map PI response structs directly into SQL parameter lists everywhere.

### 3.2 Ordering

Before persistence:

- sort episodes newest-first
- use `datePublished` as the primary ordering field
- break ties deterministically with `episodeGuid`
- assign stable `sort_index`

### 3.3 Retention Window

Keep only the bounded product window per show.

Required first-pass default:

- `maxEpisodesPerPodcast = 1000`

This may be configurable later, but the initial implementation must match the product contract approved in Instruction `008`.

### 3.4 Truncation Metadata

Compute and persist:

- `stored_episode_count`
- `is_truncated`

Interpretation:

- `is_truncated = 0` when upstream returns `<= 1000` rows
- `is_truncated = 1` when upstream returns more rows than the stored window allows

### 3.5 Approximate Size

Estimate `approx_bytes` from stored parsed fields so later budget eviction can work.

The estimate should include:

- cached podcast text fields
- cached episode text fields
- stable per-row overhead approximation

### 3.6 Field Mapping Rules

- `descriptionHtml` is deleted and must not be reintroduced.
- `duration_seconds` is stored from PI `duration` and treated as required in this podcast-only scope.
- `source_pi_item_id` may be stored for debugging or observability, but it must not become canonical identity.

## 4. Do Not

- Do not store every historical episode from large catalogs
- Do not treat legacy feed transport metadata as snapshot identity
- Do not leave ordering implicit
- Do not pretend the stored snapshot is a full archive
- Do not let mapper behavior depend on lazy schema creation

## 5. Tests

1. newest-first ordering is deterministic
2. clipping keeps only newest `1000`
3. counts and truncation metadata are correct
4. approximate byte estimation is stable enough for budget use
5. `duration` maps to integer seconds without legacy RSS conversion behavior

## 6. Return

1. snapshot types
2. clipping rules
3. verification results
