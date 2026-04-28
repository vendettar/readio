# Instruction 023b: Cloud Podcast Transcript Asset Storage

Discuss and approve this document before implementation.

This document defines how podcast transcript/subtitle results are persisted and reused in Cloud.

It must be implemented before the built-in Cloudflare ASR product cutover.

## 1. Purpose

Podcast ASR output is not just a request-local retry artifact.

Required product rule:
- if one user triggers ASR for a podcast episode
- the resulting subtitle asset should be reusable later
- later viewers should read the same backend-owned asset instead of re-running ASR

## 2. Decisions

- Persist podcast transcript results as backend-owned shared assets.
- Store the large transcript payload on disk, not inline in SQLite.
- Store transcript metadata and lookup identity in SQLite.
- Use structured `cues` JSON as the canonical stored payload.
- Compress the file as `json.gz`.
- Use `PODCASR_TRANSCRIPTS_DIR` as the transcript root path variable name.

## 3. Storage Split

SQLite owns:
- transcript asset identity
- podcast/episode metadata needed for lookup
- audio fingerprint / canonical audio identity
- provider/model/schema metadata
- artifact path / size / hash / status

Filesystem owns:
- the actual compressed transcript payload file

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

Do not store:
- pre-rendered `vtt` as the canonical source
- pre-rendered `srt` as the canonical source

Those are export/render formats, not the storage SSOT.

## 5. Identity

Transcript asset identity must be content-scoped, not request-scoped.

Recommended conceptual key:

```text
transcript_key = hash(
  canonical_audio_identity
  + provider
  + model
  + transcript_schema_version
)
```

Preferred primary audio identity:
- content-based audio fingerprint such as `audio_sha256`

Request-level `requestId` is not the transcript asset identity.

## 6. Directory Layout

Use:

```text
PODCASR_TRANSCRIPTS_DIR/$itunesId/$titleSlug-$shortKey.json.gz
```

Example:

```text
PODCASR_TRANSCRIPTS_DIR/1539020158/bear-brook-7f3a9c8b21.json.gz
```

Rules:
- `$itunesId` is the podcast-level bucket
- `titleSlug` is human-readable only
- `shortKey` comes from stable asset identity, not randomness
- no date partitioning
- no provider/model/audio URL in the filename

`titleSlug` is generated when the path is first created and then treated as stored path metadata. Later feed-title drift must not force file renames.

## 7. Runtime Path Contract

`PODCASR_TRANSCRIPTS_DIR` is a deployment/runtime path variable name, not part of transcript identity.

In production it should resolve to a shared persistent path outside release directories, for example:

```text
/opt/readio/shared/data/podcast/transcripts
```

## 8. SQLite Table Contract

Add a shared transcript asset table, for example:

```sql
CREATE TABLE asr_transcript_artifacts (
  transcript_key TEXT PRIMARY KEY,
  itunes_id TEXT NOT NULL,
  episode_title TEXT NOT NULL,
  title_slug TEXT NOT NULL,
  short_key TEXT NOT NULL,
  audio_fingerprint TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  normalized_audio_url TEXT,
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

Minimum expectations:
- `transcript_key` is authoritative
- `artifact_path` is relative to `PODCASR_TRANSCRIPTS_DIR`
- large transcript body stays on disk

## 9. Reuse Contract

Before running ASR for an episode/audio:
1. derive canonical audio identity
2. derive `transcript_key`
3. check for a reusable transcript asset
4. if found, reuse it directly
5. do not re-run ASR and do not consume built-in quota again

## 10. Safety Rules

- write transcript files atomically
- record file hash
- treat missing/corrupt files as invalid assets
- do not persist raw audio
- do not expose transcript files as public static assets

## 11. Verification

At minimum, implementation should prove:
- one user can create a transcript asset
- a later viewer can reuse the same asset
- identical audio/provider/model/schema resolves to the same `transcript_key`
- transcript payload is not stored inline in SQLite
- file path remains stable even if feed title later changes

## 12. Return

Implementation following this document should report:
1. `PODCASR_TRANSCRIPTS_DIR` handling
2. file naming rules
3. transcript asset table shape
4. canonical payload encoding
5. reuse verification results
