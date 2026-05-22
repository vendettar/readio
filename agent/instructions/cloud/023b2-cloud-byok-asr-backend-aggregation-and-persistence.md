# Instruction 023b2: Cloud BYOK ASR Backend Aggregation And Persistence

Discuss and approve this document before implementation.

This instruction defines how the existing BYOK ASR route should evolve from frontend-only chunk aggregation into a backend-owned aggregation and persistence flow.

It is intentionally narrower than `023c`. It does not implement built-in Cloudflare ASR, quota, or request-ledger governance.

## Execution Metadata

- Recommended Order: `023a` -> `023b` -> `023b2` -> `023c` -> `023d`
- Depends On:
  - `023a-cloud-backend-sqlite-goose-foundation.md`
  - `023b-cloud-podcast-transcript-asset-storage.md`
- Can Run In Parallel: no; this instruction defines a reusable backend aggregation contract that `023c` should build on instead of re-inventing
- Decision Log: Waived
- Bilingual Sync: Not applicable

## Scope

`023b2` is a backend aggregation and persistence instruction for the existing BYOK ASR flow.

It owns:
- backend aggregation of multi-chunk BYOK ASR results
- backend finalization into one canonical transcript payload
- direct linkage from a completed BYOK aggregation run into `023b` shared transcript asset storage
- minimal cleanup rules for unfinished BYOK aggregation state
- the request-shape contract between frontend chunking and backend aggregation

It does not own:
- built-in Cloudflare ASR routing or quota
- multi-user ownership / ACL
- per-user governance or attribution
- generalized background job infrastructure
- replacing the frontend chunking strategy
- transcript editing or manual upload UX

Boundary with `023b`:
- `023b` defines how a completed shared transcript asset is stored
- `023b2` defines how existing BYOK chunked transcription produces that completed asset on the backend

Boundary with `023c`:
- `023b2` is BYOK-only
- `023c` may later reuse the same aggregation/finalization shape for built-in ASR, but must keep built-in quota/request-ledger concerns separate

## 1. Purpose

Cloud already has a BYOK ASR route where the frontend:
- splits long audio into chunks
- submits chunk requests through the backend relay
- merges chunk cues in the browser

That route works, but it leaves persistence outside the backend execution path.

Required product rule for `023b2`:
- a successful BYOK ASR run should be able to produce one backend-owned shared transcript asset
- that asset should be finalized by the backend, not by sending a browser-merged final transcript back for storage

## 2. Decisions

- Keep frontend chunk planning/splitting in place for this phase.
- Move multi-chunk aggregation ownership to the backend.
- Treat each multi-chunk BYOK transcription as one logical aggregation session identified by a stable backend-visible correlation key.
- Do not introduce backend-side audio decoding, duration probing, or backend-owned chunk planning in this phase.
- Persist in-progress chunk results in SQLite as bounded aggregation state, not as final transcript assets.
- Persist the final completed transcript only once, through `023b` transcript asset storage.
- Do not persist raw audio.
- Do not persist per-chunk transcript artifacts on disk as standalone reusable files.
- Do not expose partial aggregation state as end-user-visible transcript data.
- Reuse the existing canonical relay payload shape for each chunk result and for the final merged transcript.
- Do not require frontend to send `episodeKey`; backend derives `episode_key` according to the `023b` storage rule from normalized `episodeGuid`.
- Do not introduce a separate `persistenceMode` switch for this phase; `023b2` defines the shared-persistence BYOK path only.
- When an episode already has a shared transcript asset, backend may reuse it by episode identity without requiring a `provider` / `model` match.

## 3. High-Level Flow

### 3.1 Frontend responsibilities

Frontend continues to own:
- deciding chunk boundaries
- sending chunk requests sequentially
- supplying a stable logical request identifier for the full transcription run
- supplying canonical episode identity input:
  - `itunesId`
  - `episodeGuid`
- optionally supplying `episodeTitle` as readability metadata when available

Frontend no longer owns:
- final transcript merge for persistence
- deciding when a completed BYOK transcript should be written as a shared backend asset

### 3.2 Backend responsibilities

For each BYOK chunk request, backend must:
1. authenticate and validate the relay request as today
2. require a stable BYOK aggregation correlation key
3. require `chunk_index` and `chunk_count`
4. transcribe the chunk through the existing BYOK provider relay path
5. persist the chunk result into backend aggregation state
6. if all chunks for the aggregation run are present:
   - merge chunk cues in backend order
   - create one final transcript asset through `023b`
   - mark the aggregation run finalized
   - delete chunk-level intermediate state

## 4. Correlation Contract

Backend aggregation requires one logical correlation key per full transcription run.

Use:

```text
request_id
```

Rules:
- frontend must generate one stable `request_id` per full BYOK transcription attempt
- all chunks for the same full run must carry the same `request_id`
- chunk requests must also carry:
  - `chunk_index`
  - `chunk_count`
- `chunk_index` is zero-based
- `(request_id, chunk_index)` must be unique for active aggregation state
- retries of the same chunk should overwrite or upsert the same logical chunk slot rather than creating duplicates

This instruction does not require a separate `transcription_session_id` field if `request_id` already serves that role clearly.

## 5. Payload Contract Additions

The existing BYOK relay request needs a narrow extension for backend aggregation.

Required request metadata:
- `requestId`
- `chunkIndex`
- `chunkCount`
- `itunesId`
- `episodeGuid`
- `episodeTitle` (optional)

Required behavior:
- `requestId`, `chunkIndex`, `chunkCount`, `itunesId`, and `episodeGuid` are required for the `023b2` path
- `episodeTitle` is optional readability metadata only; it is not part of transcript identity and must not gate aggregation or reuse
- backend derives `episode_key` according to `023b` from `episodeGuid`; frontend does not send `episodeKey`
- requests missing `itunesId` or `episodeGuid` are invalid for `023b2` and must be rejected
- backend must reject impossible chunk metadata such as:
  - negative `chunkIndex`
  - `chunkCount < 1`
  - `chunkIndex >= chunkCount`
  - `chunkCount > 24`

### 5.1 Response contract additions

For `023b2` BYOK chunk requests, the relay response must include a narrow aggregation envelope:

```json
{
  "cues": [...],
  "language": "en",
  "durationSeconds": 12.3,
  "provider": "groq",
  "model": "whisper-large-v3-turbo",
  "aggregation": {
    "requestId": "req_...",
    "mode": "partial | completed | reused",
    "transcriptKey": "tr_..." 
  }
}
```

Rules:
- `mode = partial`:
  - response body still carries the current chunk-local result
  - frontend must continue sending remaining chunks
- `mode = completed`:
  - response body must carry the final merged canonical transcript payload
  - `transcriptKey` is required
  - frontend must stop sending further chunks
- `mode = reused`:
  - response body must carry the reused final canonical transcript payload
  - `transcriptKey` is required
  - frontend must stop sending further chunks

## 6. Aggregation State Model

Keep the state model minimal.

Use two SQLite tables:

### 6.1 Aggregation run table

```sql
CREATE TABLE asr_aggregation_runs (
  request_id TEXT PRIMARY KEY,
  itunes_id TEXT NOT NULL,
  episode_key TEXT NOT NULL,
  episode_guid TEXT NOT NULL,
  chunk_count INTEGER NOT NULL,
  finalized_at_unix INTEGER,
  transcript_key TEXT,
  created_at_unix INTEGER NOT NULL,
  expires_at_unix INTEGER NOT NULL
);
```

Purpose:
- one row per logical ASR aggregation run
- tracks only the minimum immutable run metadata plus finalization linkage to `023b` asset storage

Required invariants:
- `chunk_count` must be between `1` and `24`
- `transcript_key` is nullable until finalization and required after successful finalization
- `finalized_at_unix` and `transcript_key` must appear together on successful completion

### 6.2 Aggregation chunk table

```sql
CREATE TABLE asr_aggregation_chunks (
  request_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  chunk_duration_seconds REAL,
  created_at_unix INTEGER NOT NULL,
  PRIMARY KEY (request_id, chunk_index)
);

CREATE INDEX idx_asr_aggregation_chunks_request
ON asr_aggregation_chunks (request_id, chunk_index);
```

Purpose:
- one row per successfully transcribed chunk result
- stores chunk-local canonical relay payload plus the duration used for offset merge

Hard bounds:
- `chunk_count` hard max is `24`, matching the current frontend `ABSOLUTE_MAX_CALLS`
- serialized `payload_json` per chunk must stay at or below `1 MiB`; larger payloads are rejected for backend aggregation in this phase
- aggregation state is allowed only for the `023b2` BYOK persistence path
- `payload_json` is bounded intermediate state only; it is never the durable transcript source and never a substitute for the final `023b` asset

## 7. Why This State Is Acceptable

This is not the same as the heavy built-in request ledger from `023c`.

It is deliberately narrower:
- no quota state
- no per-user attribution
- no policy table
- no reservation/consumption accounting
- no generalized job scheduler

It is only the minimum backend state needed to correlate multiple chunk requests into one final transcript asset.
The table names are intentionally generic so `023c` may reuse the same aggregation state shape later, while keeping built-in quota/request-governance state separate.

## 8. Merge Contract

Backend merge must follow the same core timing behavior already used in the frontend:
- order chunk payloads by `chunk_index`
- merge cues by cumulative time offset
- apply the same offset to cue-level word timings when present

Do not:
- dedupe repeated text heuristically across chunk boundaries in this phase
- rewrite transcript text
- persist chunk files as reusable transcript artifacts

Chunk duration for offset merge should be resolved with the same priority as the current frontend path:
1. `durationSeconds` from chunk result when present
2. else max cue end within that chunk result

`023b2` does not introduce backend-side audio probing or decoding as a fallback source of truth for duration.

## 9. Finalization Contract

When all chunk rows exist for a run:
1. backend merges chunk payloads into one canonical transcript payload
2. backend calls `storePodcastTranscriptAsset(...)`
3. backend stores the resulting `transcript_key` on the aggregation run
4. backend marks `finalized_at_unix`
5. backend deletes intermediate chunk rows

The final persisted shared asset must use:
- `source_kind = byok_asr`
- the BYOK `provider` and `model` when the relay response supplies them
- backend-derived `episode_key`

Classifier metadata used for the final `023b` asset row comes from current request/response context, not from extra columns on the aggregation run row.

## 10. Reuse Contract

`023b` remains the storage-layer contract:
- it stores classifier metadata such as `source_kind`, `provider`, `model`, and `audio_source_fingerprint`
- it allows multiple assets for one episode

`023b2` adds the default playback reuse rule for this BYOK path:
- before opening a new BYOK aggregation run, backend must check whether any reusable shared transcript asset already exists for that episode

Episode match for this rule:
- same `itunes_id`
- same `023b`-derived `episode_key`

If a reusable asset already exists:
- do not start a new aggregation run
- return the existing canonical transcript payload immediately
- respond with `aggregation.mode = reused`
- include `transcriptKey`

Deterministic reuse rule:
- if multiple shared transcript assets exist for that episode, choose the newest asset by `created_at_unix DESC, transcript_key DESC`
- this rule is owned by `023b2` and must not be left to worker discretion

## 11. Cleanup Contract

Backend must clean unfinished BYOK aggregation state.

Rules:
- every aggregation run row gets an `expires_at_unix`
- unfinished runs older than the configured TTL are abandoned
- cleanup removes unfinished chunk rows and the unfinished run row together
- default TTL for this phase: 24 hours

Cleanup trigger:
- startup-time cleanup is sufficient for this phase
- optional opportunistic cleanup during new-run creation is allowed
- do not require a dedicated scheduler or cron worker in `023b2`

## 12. Failure Semantics

If one chunk request fails:
- the run remains unfinished
- successful earlier chunks may remain in aggregation state until TTL cleanup or explicit retry completion

If the frontend retries the same chunk with the same `request_id` and `chunk_index`:
- backend should overwrite/upsert that chunk slot

If final asset storage fails after all chunks are present:
- backend must not silently claim success
- backend must fail closed:
  - delete the aggregation chunk rows
  - delete the aggregation run row
  - return HTTP `503` with the standard relay JSON error envelope and error code `ASR_BYOK_FINALIZATION_FAILED`
- frontend retry after that failure starts a clean new run with a new `request_id`

This instruction intentionally does not add a terminal-failed run state.

## 13. API Shape Guidance

This instruction does not require a second “save transcript” endpoint.

Preferred direction:
- extend the existing BYOK relay transcription route to accept chunk aggregation metadata
- let the last successful chunk response trigger backend finalization when the run becomes complete
- do not add a second save/finalize route
- `023b2` replaces the chunked shared-persistence behavior on that route for this phase
- requests that do not carry the required `023b2` aggregation metadata are invalid for this contract and must be rejected rather than guessed into another mode

This keeps BYOK persistence in the same backend execution path as the chunk transcription flow.

## 14. Acceptance Criteria

- BYOK chunked transcription can complete without frontend-owned final merge persistence uploads.
- Backend can correlate multiple chunk requests for one logical BYOK transcription run using `request_id`.
- Backend stores chunk-local transcription payloads in bounded SQLite aggregation state.
- Backend finalizes one merged canonical transcript payload and stores it through `023b`.
- Shared transcript asset files land under `PODCASR_TRANSCRIPTS_DIR` through the existing `023b` storage contract.
- Existing reusable BYOK transcript assets short-circuit redundant chunk re-transcription.
- Unfinished BYOK aggregation state older than the configured TTL is cleaned up on startup.
- `023b2` responses expose deterministic `aggregation.mode = partial | completed | reused` semantics.
- Final asset storage failure returns HTTP `503` with error code `ASR_BYOK_FINALIZATION_FAILED`.
- Oversize serialized chunk payloads above `1 MiB` are rejected for backend aggregation.
- Backend derives `episode_key` according to `023b` from `episodeGuid`; `episodeKey` is not a required frontend input.
- `episodeTitle` remains optional metadata and does not gate aggregation or reuse.
- Reuse can return the newest existing shared transcript asset for the same episode without requiring `provider` / `model` equality.
- Requests missing required `023b2` aggregation metadata are rejected rather than silently treated as another route mode.

## 15. Required Tests

- aggregation run creation test
- duplicate chunk upsert test for the same `(request_id, chunk_index)`
- out-of-order chunk arrival test proving backend still merges by `chunk_index`
- finalization test proving all chunks produce one `023b` transcript asset
- reuse short-circuit test proving any existing shared episode transcript asset skips new aggregation
- TTL cleanup test for unfinished runs
- word-level offset merge test
- failure test proving partial chunk state does not masquerade as a completed transcript asset
- impossible chunk metadata rejection test:
  - `chunkIndex < 0`
  - `chunkCount < 1`
  - `chunkIndex >= chunkCount`
  - `chunkCount > 24`
- response-contract tests for `023b2` requests:
  - `aggregation.mode = partial`
  - `aggregation.mode = completed`
  - `aggregation.mode = reused`
- oversize `payload_json` rejection test for the `1 MiB` bound
- request rejection test when `itunesId` or `episodeGuid` is missing
- request-shape test proving `episodeKey` is not required from frontend
- request-shape test proving `episodeTitle` is optional
- request-path test proving missing required aggregation metadata is rejected rather than routed into another mode
- finalization-failure test proving run/chunk state is deleted fail-closed

## 16. Verification Commands

- `go test ./...` from `apps/cloud-api`
- `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/asr`
- `git diff --check`

## 17. Verification

At minimum, implementation should prove:
- backend aggregation produces the same merged cue timing semantics as the prior frontend merge path
- one complete BYOK run yields exactly one final shared transcript asset
- backend cleanup removes abandoned partial runs
- repeated chunk retries do not create duplicate chunk rows
- a reusable existing shared episode transcript asset avoids unnecessary upstream transcription
- backend does not require frontend-supplied `episodeKey`
- backend does not guess between `023b2` and another hidden route mode on the same endpoint

## 18. Return

Implementation following this document should report:
1. correlation key and request-shape changes
2. aggregation tables and cleanup rules
3. backend merge/finalization behavior
4. `023b` transcript-asset linkage behavior
5. BYOK reuse short-circuit behavior
6. verification results

## 19. Doc Sync

Implementation following this document must update:
- `apps/docs/content/docs/apps/cloud/handoff/index.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/index.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/backend-sqlite-governance.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/backend-sqlite-governance.zh.mdx`
