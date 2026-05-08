# Instruction 023b: Cloud Shared Podcast Transcript Asset Storage [COMPLETED]

Discuss and approve this document before implementation.

This document defines how podcast transcript/subtitle results are persisted and reused in Cloud.

It replaces the earlier separate replay-artifact/storage split. Shared transcript asset storage is now defined in this single document.

It must be implemented before the built-in Cloudflare ASR product cutover.

## Execution Metadata

- Recommended Order: `023a` -> `023b` -> `023c` -> `023d`
- Depends On: `023a-cloud-backend-sqlite-goose-foundation.md`
- Can Run In Parallel: no; `023c` must not start before `023b` defines the storage contract
- Decision Log: Waived
- Bilingual Sync: Not applicable

## Scope

`023b` is a storage-contract instruction.

It owns:
- transcript asset SQLite schema
- transcript file naming and directory layout
- canonical stored payload contract
- runtime path derivation and file lookup contract
- retention ownership for first release

It does not own:
- built-in ASR request routing
- quota or idempotency ledger behavior
- end-user subtitle upload UX
- per-user ownership / ACL
- automatic cleanup or GC policy

Boundary with `023c`:
- `023b` defines where and how shared transcript assets are stored
- `023c` consumes that contract for built-in ASR creation/linkage/reuse

## 1. Purpose

Podcast ASR output is not just a request-local retry artifact.

Required product rule:
- if one user triggers ASR for a podcast episode
- the resulting subtitle asset should be reusable later
- later viewers should read the same backend-owned asset instead of re-running ASR

This is a content-scoped storage contract, not a request-scoped retry blob contract.

## 2. Decisions

- Persist podcast transcript results as backend-owned shared assets.
- Keep request-level quota/idempotency state separate from content-level transcript asset state.
- Store the large transcript payload on disk, not inline in SQLite.
- Store transcript metadata and lookup identity in SQLite.
- Use structured `cues` JSON as the canonical stored payload.
- Compress the file as `json.gz`.
- Use `PODCASR_TRANSCRIPTS_DIR` as the transcript root path variable name.
- One episode may have multiple transcript assets:
  - different ASR source kinds
  - different providers
  - different models
  - manual upload
- Keep both `episode_key` and `episode_guid`:
  - `episode_key` is the short stable filesystem-safe key
  - `episode_guid` is the original upstream episode identity when available
- First-release shared transcript assets require both canonical identities:
  - `itunes_id`
  - `episode_guid`
- No fallback identity path is defined in `023b`.
- Use `transcript_key = "tr_" + ULID`.
- Keep `titleSlug` in the filename for readability only; never use it for identity, lookup, reuse, or dedupe.

## 3. Request Ledger vs Shared Asset

Two different persistence concerns must stay separate.

Request ledger owns:
- request identity
- payload fingerprint
- reservation/finalization state
- quota/accounting state
- linkage to the resulting shared transcript asset when one exists

Shared transcript asset storage owns:
- transcript asset identity
- podcast/episode metadata needed for lookup
- audio source fingerprint
- source kind / provider / model metadata
- file name / size / created time

Filesystem owns:
- the actual compressed transcript payload file

Do not collapse request identity and transcript asset identity into one field.

## 4. Canonical Payload

The stored payload should match the relay response shape already used by the app:

```json
{
  "cues": [{ "start": 0.0, "end": 2.4, "text": "example" }],
  "language": "en",
  "durationSeconds": 7200.5,
  "provider": "cloudflare",
  "model": "@cf/openai/whisper-large-v3-turbo"
}
```

Canonical payload rule:
- stored transcript JSON must round-trip the full current canonical cue shape
- if cue objects contain optional fields already used by the app or relay, such as `words` or `speakerId`, those fields must be preserved
- `023b` must not silently narrow cues to a reduced `{start,end,text}`-only shape

Do not store:
- pre-rendered `vtt` as the canonical source
- pre-rendered `srt` as the canonical source

Those are export/render formats, not the storage SSOT.

## 5. Identity

Transcript asset identity must be content-scoped, not request-scoped, but it does not need a complex derived hash key.

Rules:
- `transcript_key` is a generated asset ID, not a derived business key
- `requestId` is not a transcript asset identity
- `titleSlug` is not identity
- `episode_guid` may be long or URL-shaped, so it must not be used directly as a directory name
- `episode_key` must be a short, stable, filesystem-safe episode identifier derived from normalized episode identity input
- `episode_guid` should be retained separately when available for upstream traceability and future feed alignment
- `episode_key` is a storage-layer identifier; it must derive directly from normalized episode identity, not from a route-layer compact key

Recommended shape:

```text
transcript_key = "tr_" + ULID
episode_key = "ep_" + short_hash(normalized_episode_guid)
```

Normalization rule:
- trim outer whitespace from `episode_guid`
- lowercase the full trimmed identity before hashing, regardless of whether it is UUID-shaped
- `episode_key` must not depend on frontend route encoding or `compactKey`

## 6. Directory Layout

Use:

```text
PODCASR_TRANSCRIPTS_DIR/$itunesId/$episodeKey/
```

Transcript file name:

```text
$transcriptKey-$titleSlug.json.gz
```

Full example:

```text
PODCASR_TRANSCRIPTS_DIR/1539020158/ep_8f24a6f1d2aa/tr_01JT7J4X2R8WQ8N34V5Y1A2BCD-bear-brook.json.gz
```

Rules:
- `$itunesId` is the podcast-level bucket
- `$episodeKey` is the episode-level bucket
- `transcriptKey` is the unique asset identity in the filename
- `titleSlug` is human-readable only
- the filename must use the exact delimiter shape `transcriptKey-titleSlug.json.gz`
- no date partitioning
- no provider/model/audio URL in the filename
- no request ID in the filename

`titleSlug` generation rules:
- Unicode-safe normalization / cleanup
- filesystem-safe replacement of separators and control characters
- truncate at a UTF-8-safe boundary to at most 30 bytes
- slug is for readability only

Runtime file location rules:
- lookup must not require `titleSlug` equality
- normal runtime lookup should use the stored `file_name`
- absolute file path is derived as `PODCASR_TRANSCRIPTS_DIR + "/" + itunes_id + "/" + episode_key + "/" + file_name`
- `$itunesId/$episodeKey/` plus `transcriptKey-` prefix matching is only a fallback / recovery strategy, not the primary lookup path
- `episode_title` may be used to regenerate a readable slug, but must not be treated as a strong locator field

## 7. Runtime Path Contract

`PODCASR_TRANSCRIPTS_DIR` is a deployment/runtime path variable name, not part of transcript identity.

In production it should resolve to a shared persistent path outside release directories, for example:

```text
/opt/readio/shared/data/podcast/transcripts
```

Deployment contract rule:
- `PODCASR_TRANSCRIPTS_DIR` is already owned by the deployment/runtime contract
- `023b` implementation may assume the root directory contract exists
- worker implementation for `023b` does not own base-directory provisioning in GitHub Actions or VPS bootstrap scripts

Eligibility rule:
- first-release shared transcript assets are only supported for podcast episodes that have both:
  - `itunes_id`
  - `episode_guid`
- if either is missing, the episode is out of scope for `023b`
- `023b` defines no fallback identity path

## 8. SQLite Table Contract

Add a shared transcript asset table:

```sql
CREATE TABLE podcast_transcript_assets (
  transcript_key TEXT PRIMARY KEY,
  itunes_id TEXT NOT NULL,
  episode_key TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  episode_title TEXT,
  source_kind TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  audio_source_fingerprint TEXT,
  file_name TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_podcast_transcript_assets_episode
ON podcast_transcript_assets (itunes_id, episode_key);

CREATE INDEX idx_podcast_transcript_assets_reuse_lookup
ON podcast_transcript_assets (
  itunes_id,
  episode_key,
  source_kind,
  provider,
  model,
  audio_source_fingerprint
);
```

Minimum expectations:
- `transcript_key` is authoritative
- `file_name` stores only the final file name, not a full relative path
- runtime directory is derived from `PODCASR_TRANSCRIPTS_DIR + "/" + itunes_id + "/" + episode_key + "/"`
- large transcript body stays on disk
- SQLite does not store the transcript JSON body inline in this table

Column rationale:
- `transcript_key`: unique transcript asset ID, generated as `tr_` + ULID
- `itunes_id`: podcast bucket identity; use `TEXT` to match the app's string handling
- `episode_key`: short stable directory-safe episode key
- `episode_guid`: original upstream episode identity when available
- `episode_guid`: required in first release because shared transcript assets are only supported for episodes with canonical upstream episode identity
- `episode_title`: frozen title snapshot for readability / admin use; not identity
- `source_kind`: backend-provided classifier string; stored as-is after trimming, with no SQLite enum enforcement in this phase
- `provider` / `model`: optional classifier metadata; if the backend supplies transcript classifier metadata, it should supply a cohesive tuple together with `audio_source_fingerprint`
- `audio_source_fingerprint`: optional first-release locator fingerprint; when classifier metadata is supplied, use `sha256(normalized_enclosure_url)` and persist only a short prefix such as `sha256:9f86d081884c7d659a2feaa`
- `normalized_enclosure_url` means:
  - trim outer whitespace
  - if URL parsing succeeds, drop fragment and lowercase scheme + host
  - preserve path and query
  - if parsing fails, fall back to the trimmed raw string
- persist format is fixed as `sha256:` + first 24 lowercase hex characters
- `file_name`: actual stored file name such as `tr_...-bear-brook.json.gz`
- `file_size_bytes`: compressed file size on disk
- `created_at`: UTC instant in RFC3339 / `Z` form

Columns intentionally not included in `023b`:
- no `content_hash`
- no `relative_path`
- no `status`
- no `updated_at`
- no `last_accessed_at`
- no `schema_version`

## 9. Reuse Contract

Before creating a new transcript asset:
1. identify the episode via `itunes_id` + `episode_key`
2. classify the requested asset by `source_kind`, `provider`, `model`, and `audio_source_fingerprint`
3. a matching prior asset may be reused by later phases, but `023b` does not enforce uniqueness across the classification tuple
4. do not use `titleSlug` for matching
5. do not use `requestId` for shared asset identity

One episode may legitimately retain multiple transcript assets. `023b` does not force a single-version-per-episode model.
Even when `source_kind`, `provider`, `model`, and `audio_source_fingerprint` are identical, different `transcript_key` values still represent different transcript assets.

## 10. Safety Rules

- write transcript files atomically
- treat missing files as invalid assets
- do not persist raw audio
- do not expose transcript files as public static assets
- do not key shared transcript file paths by request date
- do not key shared transcript file paths by `requestId`
- do not persist duplicate canonical `json`, `vtt`, and `srt` assets for the same transcript in this phase
- do not make file lookup depend on exact title text equality
- first-release retention is permanent by default
- `023b` defines no automatic TTL or GC
- cleanup is operator-managed outside this phase

## 11. Acceptance Criteria

- A goose migration creates `podcast_transcript_assets` under the `023a` migration path.
- Backend code can derive the absolute transcript file path from:
  - `PODCASR_TRANSCRIPTS_DIR`
  - `itunes_id`
  - `episode_key`
  - `file_name`
- Backend code can generate `episode_key` directly from normalized `episode_guid` without depending on frontend route encoding.
- Canonical transcript JSON persists the full cue shape used by the relay, including optional cue fields when present.
- Missing `itunes_id` or missing `episode_guid` rejects the `023b` shared-asset path rather than inventing a fallback identity.
- First-release retention behavior is documented and implemented as permanent-by-default with no automatic GC.
- SQLite keeps only minimal structural constraints in this phase; `source_kind` business semantics and `file_size_bytes` positivity are not enforced in the schema.
- Reuse-path lookup is backed by an explicit non-unique SQLite index.

## 12. Required Tests

- migration test for `podcast_transcript_assets`
- `episode_key` derivation test against known normalized-identity vectors
- transcript file-name generation test, including Unicode-safe slug truncation
- transcript absolute-path derivation test from `itunes_id + episode_key + file_name`
- payload round-trip test proving optional cue fields survive persistence
- eligibility test proving missing `itunes_id` or `episode_guid` is rejected for shared-asset creation
- schema test proving opaque `source_kind` values are accepted and `file_size_bytes = 0` remains allowed
- reuse-lookup query/index test covering `(itunes_id, episode_key, source_kind, provider, model, audio_source_fingerprint)`
- file lookup test proving runtime does not require exact `titleSlug` equality

## 13. Verification Commands

- `go test ./...` from `apps/cloud-api`
- `git diff --check`

## 14. Verification

At minimum, implementation should prove:
- backend storage code can create a shared transcript asset row plus file
- backend storage code can later reopen the same stored asset by structured identity fields
- one episode can keep multiple transcript assets without filename collision
- transcript payload is not stored inline in SQLite
- runtime can locate the file from `itunes_id`, `episode_key`, and `file_name` without strong `titleSlug` matching
- `source_kind` remains an opaque stored classifier value; schema enforcement stays structural only

## 15. Return

Implementation following this document should report:
1. `PODCASR_TRANSCRIPTS_DIR` handling
2. file naming rules
3. transcript asset table shape
4. canonical payload encoding
5. reuse verification results

## Completion

- Completed by: Codex
- `PODCASR_TRANSCRIPTS_DIR` handling:
  - runtime root remains explicit and absolute-path only
  - transcript file paths are derived from `PODCASR_TRANSCRIPTS_DIR + "/" + itunes_id + "/" + episode_key + "/" + file_name`
- File naming rules:
  - stored files use `transcriptKey-titleSlug.json.gz`
  - `titleSlug` remains readability-only, UTF-8-safe, and never participates in identity or runtime lookup
- Transcript asset table shape:
  - SQLite stores metadata only: `transcript_key`, canonical episode identifiers, classifier fields, `file_name`, size, and `created_at`
  - transcript JSON body stays on disk and the reuse lookup index remains non-unique
- Canonical payload encoding:
  - stored payload is canonical relay-shaped `cues` JSON compressed as `json.gz`
  - optional cue fields such as `words` and `speakerId` round-trip without narrowing
- Reuse verification results:
  - duplicate classifier matches remain distinct transcript assets at the storage layer
  - runtime reopen uses stored `file_name`; it does not require exact `titleSlug` equality
- Commands:
  - `gofmt -w apps/cloud-api/transcript_storage.go apps/cloud-api/transcript_storage_test.go`
  - `go test ./...` (from `apps/cloud-api`)
  - `git diff --check`
- Date: 2026-04-30
- Reviewed by: Codex (Architect, DBA, BA, Reviewer/QA post-implementation review)
