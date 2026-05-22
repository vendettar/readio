# Instruction 001b: PI Snapshot Mapping And Retention [COMPLETED]

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
- replacement of the current in-memory oversized-payload skip-cache policy with bounded SQLite persistence

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
	RefreshNotBefore      time.Time
	Episodes              []piEpisodeSnapshot
}
```

Do not map PI response structs directly into SQL parameter lists everywhere.

### 3.2 Ordering

Before persistence:

- canonical episode order must be newest-first
- use PI `datePublished` as the primary ordering field
- break ties deterministically with `episodeGuid`
- persist the ordered rows without adding a derived ordering column

Ordering contract note:

- upstream PI array order is not the canonical product contract for stored episode lists
- the SQLite cutover intentionally defines canonical list order as `datePublished DESC`, then `episodeGuid ASC`
- route reads, paging, and frontend rendering should follow that canonical stored order instead of preserving raw upstream array order

### 3.3 Retention Window

Keep only the bounded product window per show.

Required first-pass default:

- `maxEpisodesPerPodcast = 1000`

This may be configurable later, but the initial implementation must match the product contract approved in Instruction `008`.

Current-policy replacement rule:

- today the PI episode-list path may refuse to cache oversized payloads in process memory
- after the SQLite cutover, oversized PI episode-list payloads should no longer be dropped from caching solely because they are too large for the old in-memory cache strategy
- instead, the mapper must normalize, deduplicate, clip to the bounded product window, and persist the resulting structured snapshot into SQLite
- budget protection should happen through bounded retention and later eviction policy, not by skipping durable cache population entirely

### 3.4 Truncation Metadata

Compute and persist:

- `is_truncated`

Interpretation:

- cold initialization requests `episodes/byitunesid?max=1000`, while later stale refreshes request `episodes/byitunesid?since=<latest_stored_date_published_unix_minus_one>` to avoid skipping same-second upstream episodes
- the first implementation cannot reliably observe the full upstream historical count from the episode-list response alone
- `is_truncated = 0` when the persisted snapshot fits within the stored window and there is no evidence that the show exceeds that window
- `is_truncated = 1` when the stored window is full and podcast-level metadata indicates the show likely has more episodes than were retained
- first-pass evidence may come from `podcasts/byitunesid.episodeCount` when that value is present and greater than the retained episode row count
- if no trustworthy overflow evidence exists, prefer a conservative `is_truncated = 0` rather than pretending full-history knowledge
- the retained episode row count is derived with `COUNT(*)` from `podcast_episodes`; it is not stored as authoritative metadata

### 3.5 Approximate Size

Estimate `approx_bytes` from stored parsed fields so later budget eviction can work.

The estimate should include:

- cached podcast text fields
- cached episode text fields
- stable per-row overhead approximation

### 3.6 Field Mapping Rules

- `descriptionHtml` is deleted and must not be reintroduced.
- `duration_seconds` is stored from PI `duration` and treated as required in this podcast-only scope.

Episode normalization must stay aligned with the current cloud-api behavior unless an explicit product decision changes it:

- skip episode items missing required base fields such as `guid`, `title`, `datePublished`, `duration`, or `enclosureLength`
- treat invalid required audio URLs as invalid upstream payload, not as a silently accepted partial episode row
- skip episode items whose artwork URL is invalid for the current page-rendering contract
- deduplicate by canonical `episodeGuid`
- when duplicates exist, keep the deterministically selected winner after canonical ordering and normalization rather than depending on upstream array accident
- normalize optional fields such as `link`, `transcriptUrl`, `episodeType`, `season`, and `episode` with the same product-facing semantics currently used by the DTO mapper

## 4. Do Not

- Do not store every historical episode from large catalogs
- Do not treat legacy feed transport metadata as snapshot identity
- Do not leave ordering implicit
- Do not pretend the stored snapshot is a full archive
- Do not let mapper behavior depend on lazy schema creation
- Do not preserve the old "oversized payload means do not cache at all" rule once SQLite is the main cache layer

## 5. Tests

1. newest-first canonical ordering is deterministic
2. clipping keeps only newest `1000`
3. counts and truncation metadata are correct
4. approximate byte estimation is stable enough for budget use
5. `duration` maps to integer seconds without legacy RSS conversion behavior
6. truncation behavior is deterministic when `episodeCount` is missing, equal to the stored count, or greater than the stored count
7. duplicate GUID handling is deterministic
8. invalid artwork and invalid required audio cases follow the intended keep/skip/error split
9. stored ordering no longer depends on raw upstream array order

## 6. Return

1. snapshot types
2. clipping rules
3. verification results

## Completion

- Completed by: Worker (Codex)
- Reviewed by: Codex (GPT-5)
- Commands: `pnpm -C apps/cloud-api exec go test ./...`
- Date: 2026-05-18
