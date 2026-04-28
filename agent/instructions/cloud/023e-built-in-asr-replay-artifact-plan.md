# Instruction 023e: Shared Transcript Asset Storage Plan

Execute this document as a storage-design companion to `023`, `023c`, and `023d`.

It does **not** replace:
- `023-cloudflare-asr-readio.md` for end-user / ops product behavior
- `023c-cloudflare-asr-sqlite-schema-plan.md` for the core SQLite schema
- `023d-cloudflare-asr-sqlite-migration-plan.md` for migration delivery

This document exists because the built-in ASR output is no longer just a request-scoped retry artifact.

The product requirement is stronger:
- once a program episode has been transcribed
- the resulting structured subtitle payload should be reusable
- a later viewer should be able to read the same subtitle asset directly
- reuse should come from a backend-owned file asset, not from re-running ASR

That changes the storage design completely.

## 1. Decision

- **Decision**: Built-in ASR output must be modeled as a **shared transcript asset**, not as a short-lived request replay artifact.
- **Decision**: Request-level quota/idempotency state and content-level transcript asset state must be stored separately.
- **Decision**: SQLite remains the source of truth for usage/accounting and transcript-asset indexing, but it must **not** store large transcript/cues payloads inline.
- **Decision**: The transcript payload itself must be stored as a backend-owned compressed JSON file on disk.
- **Decision**: The canonical stored payload remains structured cues JSON, not rendered `vtt` or `srt`.
- **Decision**: Shared transcript asset paths must **not** be date-partitioned. Their identity must be based on stable content identity.
- **Decision**: Raw audio must still never be persisted by this feature.
- **Decision**: Transcript assets are reusable cache/storage objects, not request-only recovery blobs.

## 2. Why `023` Needs This Addendum

`023` pinned:
- stable built-in `requestId`
- payload fingerprint conflict detection
- no raw audio persistence
- privacy-minimizing backend ownership

But the current product rule is broader than request replay:
- user A triggers ASR on an episode
- the result is written once
- user B later opens the same episode
- user B should read the same backend-owned subtitle asset directly

That means the stored object is no longer defined by:
- when the request happened
- which browser retry needed recovery

It is defined by:
- which audio content was transcribed
- which ASR provider/model/schema produced the output

So the storage contract must move from:
- request-scoped replay artifact

to:
- shared transcript asset

## 3. Ownership Split

The storage boundary must be explicit.

### 3.1 SQLite owns two different classes of metadata

SQLite owns:

1. **request ledger state**
   - request identity
   - payload fingerprint
   - usage accounting
   - reservation/finalization state
   - failure codes

2. **shared transcript asset metadata**
   - transcript asset identity
   - canonical audio identity / audio fingerprint
   - provider/model/schema identity
   - file path / encoding / size / hash
   - lifecycle metadata for reuse and cleanup

SQLite must **not** store:
- large inline transcript/cues payloads
- raw audio
- duplicate rendered subtitle formats

### 3.2 Filesystem owns the large transcript payload

The actual shared subtitle payload must be stored as a backend-owned file on disk.

That file contains the structured ASR result payload corresponding to the relay contract:
- cues
- language
- durationSeconds
- provider
- model

This keeps SQLite narrow and avoids database bloat for long audio jobs.

## 4. Two-Layer Data Model

This plan requires a hard separation between:

### 4.1 Request ledger

This is request-scoped.

It answers:
- did a specific built-in request reserve quota
- did it complete
- did it fail
- was it a duplicate
- what shared transcript asset did it ultimately produce or reuse

This remains the job of `asr_builtin_usage_requests`.

### 4.2 Shared transcript asset

This is content-scoped.

It answers:
- does the backend already own a subtitle asset for this audio content
- where is that asset stored
- what provider/model/schema produced it
- can a later viewer reuse it directly

This should be modeled separately from the usage ledger.

## 5. Canonical Stored Payload

The canonical transcript asset should store the same logical relay response shape already used by the frontend/backend ASR contract:

```json
{
  "cues": [
    {
      "start": 0.0,
      "end": 2.4,
      "text": "example"
    }
  ],
  "language": "en",
  "durationSeconds": 7200.5,
  "provider": "cloudflare",
  "model": "@cf/openai/whisper-large-v3-turbo"
}
```

Required rules:
- store structured cues, not pre-rendered subtitle text
- do not invent a second transcript-only payload shape if `asrRelayResponsePayload` already exists
- if the relay response shape evolves later, asset decoding must evolve compatibly

Why cues JSON is the right canonical asset:
- easiest to replay to the frontend
- easiest to convert later into `vtt`, `srt`, or plain text
- avoids locking storage to one export format

## 6. Encoding And Compression

Recommended stored artifact encoding:
- `json.gz`

Required rationale:
- transcript/cues payloads compress well
- implementation remains simple
- debugging remains tractable
- the file stays portable

Do **not** start with:
- SQLite inline JSON blobs
- custom binary formats
- duplicated `json` + `vtt` + `srt` artifacts for the same transcript

At the current phase, `json.gz` is the best practical contract.

## 7. Transcript Asset Identity

The asset identity must be based on stable content identity, not request timing.

### 7.1 What must not define identity

Do **not** key the transcript asset by:
- request date
- `requestId`
- the viewer who triggered ASR
- transient retry state

These are request/accounting concerns, not transcript asset identity.

### 7.2 What should define identity

The transcript asset key should be derived from a canonical tuple such as:

- canonical audio identity or audio fingerprint
- ASR provider
- ASR model
- transcript schema version

Recommended conceptual key:

```text
transcript_key = hash(
  canonical_audio_identity
  + provider
  + model
  + transcript_schema_version
)
```

### 7.3 Canonical audio identity recommendation

Preferred primary identity:
- content-based audio fingerprint such as `audio_sha256`

Why:
- strongest dedupe semantics
- stable across users
- stable across time
- not dependent on feed URL churn or tracking wrappers

Episode metadata such as:
- podcast ID
- episode GUID
- normalized audio URL

may still be useful as lookup/index hints, but they should not be the strongest canonical identity if content fingerprinting is available.

## 8. Directory Layout

Shared transcript assets must live under a backend-owned persistent data directory, not in the frontend build output and not in a temp directory.

Because the asset is shared and reusable across viewers, the path must **not** be date-partitioned.

For the current Cloud deployment shape, the recommended base directory is the backend-owned runtime path:

```text
PODCASR_TRANSCRIPTS_DIR
```

Recommended layout:

```text
PODCASR_TRANSCRIPTS_DIR/$itunesId/$titleSlug-$shortKey.json.gz
```

Example:

```text
PODCASR_TRANSCRIPTS_DIR/1539020158/bear-brook-7f3a9c8b21.json.gz
```

Where:
- `$itunesId` is the podcast-level ownership bucket
- `$titleSlug` is a sanitized, human-readable episode-title slug
- `$shortKey` is a short stable suffix derived from the transcript asset identity, used only to avoid filename collisions and preserve stable lookup

Required path rules:
- do not trust raw user input as a literal filename
- do not include request date in the asset path
- do not include provider/model/audio URL in the filename; keep those in SQLite metadata
- keep asset path deterministic for a given transcript asset
- never allow path traversal via request-supplied values

### 8.1 `titleSlug` rules

`titleSlug` should:
- be derived from the episode title
- be lowercased
- retain only `a-z`, `0-9`, and `-`
- collapse repeated separators into a single `-`
- trim leading/trailing `-`
- be length-limited, for example 48-64 characters
- fall back to `untitled` if sanitization removes everything

`titleSlug` exists for operator readability only. It is not the authoritative transcript identity.
It is generated when the asset path is first created and then treated as a stored path component. Later feed-title drift must not force path renames or asset-key churn.

### 8.2 `shortKey` rules

`shortKey` should:
- be derived from the stable transcript asset identity, for example the first 8-12 hex chars of `transcript_key`
- not be random
- remain stable for the same transcript asset

`shortKey` exists to prevent collisions between similar titles and to keep file lookup stable even if human-readable title fragments are not unique.

This layout is preferable because:
- same asset path remains stable over time
- multiple users naturally converge on the same file
- operators can still recognize the episode from the filename
- provider/model/audio URL stay in the database, not duplicated into the path
- GC and backup remain manageable

For deployment, `PODCASR_TRANSCRIPTS_DIR` should resolve to a shared persistent path outside release directories, for example:

```text
/opt/readio/shared/data/podcast/transcripts
```

`PODCASR_TRANSCRIPTS_DIR` is a deployment/runtime path variable name, not part of the transcript asset identity itself.

## 9. SQLite Schema Direction

This plan should not overload the usage ledger with every transcript-storage concern.

### 9.1 Keep `asr_builtin_usage_requests`

`asr_builtin_usage_requests` remains authoritative for:
- request ledger state
- quota accounting
- idempotency
- request lifecycle

Recommended additive linkage field:
- `transcript_key TEXT`

Meaning:
- this request ultimately produced or reused the shared transcript asset identified by `transcript_key`

### 9.2 Add `asr_transcript_artifacts`

This plan recommends a separate table for shared transcript asset metadata.

Recommended shape:

```sql
CREATE TABLE asr_transcript_artifacts (
  transcript_key TEXT PRIMARY KEY,
  audio_fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  artifact_path TEXT NOT NULL,
  artifact_encoding TEXT NOT NULL,
  artifact_size_bytes INTEGER NOT NULL,
  artifact_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT,
  status TEXT NOT NULL
);
```

Recommended status enum:
- `ready`
- `stale`
- `invalid`
- `deleting`

Meaning:
- `ready`: reusable
- `stale`: known to need refresh or replacement
- `invalid`: file/hash/decoding no longer trustworthy
- `deleting`: cleanup in progress

If status feels too heavy for first delivery, the minimal first phase may ship without it, but the table boundary itself is still the right design.

### 9.3 Minimum required fields

Required transcript asset metadata:
- `transcript_key`
- `itunes_id`
- `episode_title`
- `title_slug`
- `short_key`
- `audio_fingerprint`
- `provider`
- `model`
- `schema_version`
- `artifact_path`
- `artifact_encoding`
- `artifact_size_bytes`
- `artifact_sha256`
- `created_at`
- `updated_at`

Optional but recommended:
- `last_accessed_at`
- `status`

Do **not** add in this phase:
- inline transcript preview columns
- rendered `vtt` / `srt` columns
- raw audio references
- per-user ownership fields on the transcript asset itself

## 10. Read / Reuse Contract

The shared transcript asset contract must be explicit.

### 10.1 Before running built-in ASR

For a requested episode/audio:
1. derive the canonical audio identity / fingerprint
2. derive the transcript key for the current provider/model/schema tuple
3. check whether `asr_transcript_artifacts` already contains a `ready` asset
4. if yes, serve/reuse it directly instead of re-running ASR

### 10.2 On first successful transcription

If no ready shared asset exists:
1. reserve built-in quota
2. call upstream ASR
3. receive successful relay payload
4. write the transcript asset file atomically
5. insert or update the transcript asset metadata row
6. mark the usage ledger row as `consumed`
7. link the usage row to `transcript_key`
8. return the transcript payload

### 10.3 For later viewers

If a later viewer opens the same episode/audio and the same transcript key resolves to a ready asset:
- do not re-run ASR
- do not consume built-in quota again
- read the existing asset and return it

This is the core shared-asset requirement.

## 11. Request Idempotency Still Matters

Even with shared transcript assets, request-level idempotency does not disappear.

`requestId` and payload fingerprint still matter for:
- quota reservation correctness
- duplicate-submit handling
- browser retry safety
- avoiding double upstream submission while work is in progress

So the correct design is:
- shared transcript asset for content reuse
- request ledger for request correctness

Do not collapse these into one concept.

## 12. Lifecycle And Cleanup

This plan no longer models transcript files as short-lived retry-only artifacts.

So cleanup semantics must change.

### 12.1 No date-based expiry contract

Do **not** define the shared transcript asset as:
- expiring strictly by day
- tied to the request date
- invalid merely because the original request is old

That would conflict with the cross-user reuse requirement.

### 12.2 Cleanup should be cache-governed, not request-replay-governed

Acceptable future cleanup policies include:
- storage-cap-based eviction
- LRU/LFU-like eviction
- explicit invalidation when the audio identity changes
- operator/manual cleanup
- schema-version invalidation

The first implementation does not need to finalize all of these, but it must avoid pretending that a shared transcript asset is just a 24-hour replay file.

### 12.3 `last_accessed_at`

If cleanup is expected later, `last_accessed_at` is a useful field.

It can support:
- future LRU-style eviction
- ops visibility into hot/cold transcript assets

It is optional for the first cut, but recommended.

## 13. Write And Read Safety

### 13.1 Atomic write requirement

Transcript asset writes must be atomic enough that a crash does not leave a half-written file treated as valid.

Recommended pattern:
1. write to a temp file in the same directory
2. flush/close
3. rename into final path
4. only then mark the transcript asset row as ready
5. only then finalize the usage ledger row as `consumed`

### 13.2 Integrity requirement

The backend should record a content hash for the stored asset.

Minimum acceptable contract:
- `artifact_sha256`

On read:
- if integrity validation fails, do not return corrupted data
- mark the asset non-ready or invalid
- require refresh/regeneration semantics instead of silently trusting broken bytes

### 13.3 Relative path storage

Prefer storing a relative `artifact_path` rooted at the transcript-asset base directory.

For the recommended deployment layout above, that means SQLite should store values like:

```text
1539020158/bear-brook-7f3a9c8b21.json.gz
```

not the full absolute path.

Why:
- easier relocation of the data root
- less machine-specific path leakage in SQLite
- simpler backup/migration reasoning

## 14. Privacy And Governance Boundary

This design refines the older blanket statement from `023`.

The new precise rule should be:
- built-in ASR must not persist raw audio
- built-in ASR backend storage must not become an arbitrary transcript archive
- built-in ASR may persist shared transcript assets for content reuse across viewers
- those assets must be stored as backend-owned files with explicit indexing and future cleanup policy

This is still narrower than a full user-document archive because:
- the stored object is tied to canonical audio content, not free-form user uploads
- ownership is operational/backend-owned
- raw audio is still excluded
- the stored shape is structured subtitle output only

## 15. Interaction With `023c`

`023c` should be interpreted as follows after `023e`:

- `asr_builtin_usage_requests` remains the authoritative request/accounting ledger
- shared transcript asset metadata is a separate concern and should live in its own table
- transcript asset files are not the authoritative quota source
- transcript asset files are shared content outputs, not request rows

So the practical schema expectation changes from:
- one usage table plus optional manifest fields only

to:
- request ledger table
- shared transcript asset table
- linkage between them via `transcript_key`

## 16. Interaction With `023d`

`023d` migration delivery rules still stand.

Expected migration shape after this plan:
- a new additive migration for `transcript_key` linkage on usage rows
- a new additive migration for `asr_transcript_artifacts`
- no rewrite of historical migrations once they are considered shipped

## 17. What Not To Do

- Do not store full transcript/cues JSON inline in SQLite for long audio jobs.
- Do not key shared transcript file paths by request date.
- Do not key shared transcript file paths by `requestId`.
- Do not persist raw audio bytes.
- Do not render and persist duplicate `json`, `vtt`, and `srt` assets for the same transcript in this phase.
- Do not collapse request ledger identity and transcript asset identity into one ID.
- Do not place transcript assets under static asset directories or web-visible paths.

## 18. Recommended Implementation Return

Implementation following this document should report:

1. transcript asset identity rule chosen
2. asset base directory chosen
3. SQLite transcript asset table added
4. usage-ledger linkage field added
5. artifact encoding/compression used
6. hash-sharded directory layout implemented
7. cross-user transcript reuse verification results
