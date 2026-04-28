# Instruction 023c: Built-In ASR SQLite Schema Plan

Execute this document as a schema-design companion to `023`, not as a standalone product instruction.

This document exists to pin down the SQLite persistence contract for Cloud built-in ASR before implementation spreads across backend quota enforcement, admin policy updates, and future `023b` subject-governance work.

It does **not** replace:
- `023-cloudflare-asr-readio.md` for product/API/ops behavior
- `023b-cloudflare-asr-ops-governance-plan.md` for future per-subject governance

## 1. Goal

Define the minimal SQLite schema needed for:
- mutable built-in ASR runtime policy
- request-level quota accounting with idempotency
- shared transcript asset indexing and lookup
- optional future admin audit history
- optional future daily summary acceleration

The schema should stay narrow, additive, and operationally safe.

## 2. Ownership Split

The storage boundary for built-in ASR must be explicit:

### 2.1 `env` owns deployment capability

Keep these in backend runtime env only:
- `READIO_CF_ACCOUNT_ID`
- `READIO_CF_API_TOKEN`
- built-in model identifier or allowlist
- any deployment-level hard allow/deny switch such as `READIO_ASR_BUILTIN_ALLOWED`

These are deployment-time capability boundaries, not mutable operator policy.

### 2.2 SQLite owns mutable runtime policy

Keep these in SQLite:
- built-in enabled/disabled state
- daily quota limit
- in-flight concurrency limit
- built-in usage ledger
- shared transcript asset metadata and asset-to-request linkage
- optional future admin audit trail

These are operator-managed runtime controls and must be mutable without editing env or restarting the service.

## 3. Empty-DB Bootstrap Contract

This must be pinned before implementation:

- If backend env credentials are present but the SQLite policy table has no row yet, built-in ASR must default to **disabled / not configured**.
- The system must **not** auto-create an enabled default quota policy on first boot.
- `023` must use a single bootstrap interpretation for an empty policy table:
  - no row present means `disabled / not configured`
  - do not silently seed a disabled row during ordinary startup
- The first operator enablement must happen explicitly through the admin/ops policy flow.
- BYOK ASR behavior must remain unaffected when built-in policy rows are absent.

This keeps first deployment conservative and auditable.

## 4. Core Tables

## 4.1 `asr_builtin_quota_config`

Purpose:
- store the single current built-in ASR policy row
- support runtime updates from `/ops`
- support optimistic concurrency on admin edits

Recommended shape:

```sql
CREATE TABLE asr_builtin_quota_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL,
  daily_limit_seconds INTEGER NOT NULL,
  in_flight_limit INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);
```

Required semantics:
- this is a single-row table; `id = 1`
- `enabled = 0` means built-in ASR is not usable for normal traffic
- `version` must be incremented on every admin mutation so concurrent writes do not silently clobber each other

Recommended constraints:
- `daily_limit_seconds > 0` when enabled
- `in_flight_limit > 0` when enabled

## 4.2 `asr_builtin_usage_requests`

Purpose:
- request-level built-in quota ledger
- idempotency lookup surface
- reservation/finalization state source
- current-day usage breakdown source for `/ops`

Recommended shape:

```sql
CREATE TABLE asr_builtin_usage_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  day_key_utc TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  estimated_seconds INTEGER NOT NULL,
  status TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  transcript_key TEXT,
  failure_code TEXT,
  reserved_at TEXT NOT NULL,
  finalized_at TEXT,
  expires_at TEXT
);
```

Required semantics:
- `request_id` is the built-in idempotency key
- `day_key_utc` is the UTC accounting bucket such as `2026-04-28`
- `payload_fingerprint` exists to reject “same request ID, different logical request”
- `estimated_seconds` is the operational quota unit
- `provider` is retained even if `023` initially uses only built-in Cloudflare, so later built-in provider expansion does not require rewriting the ledger contract
- `model` is retained for operational debugging and future built-in model/provider evolution

Required status enum:
- `reserved`
- `consumed`
- `released`
- `failed`

Recommended check constraint:

```sql
CHECK (status IN ('reserved', 'consumed', 'released', 'failed'))
```

Required uniqueness:

```sql
CREATE UNIQUE INDEX idx_asr_builtin_usage_day_request
ON asr_builtin_usage_requests(day_key_utc, request_id);
```

Required state rules:
- new built-in requests begin as `reserved`
- successful upstream completion finalizes to `consumed`
- requests that fail before successful completion finalize to `released` or `failed` according to the contract chosen in `023`
- terminal rows must not transition back to `reserved`
- `transcript_key` may be null until a shared transcript asset is successfully produced or linked

Minimum replay semantics this table must support:
- same `request_id` + same `payload_fingerprint` + same `day_key_utc` -> idempotent replay path
- same `request_id` + different `payload_fingerprint` + same `day_key_utc` -> conflict

## 4.3 `asr_transcript_artifacts`

Purpose:
- store shared transcript asset metadata
- support cross-user transcript reuse
- keep large transcript payloads out of SQLite while preserving deterministic lookup

Recommended shape:

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

Required semantics:
- `transcript_key` is the authoritative asset identity
- `artifact_path` points to a backend-owned file under `PODCASR_TRANSCRIPTS_DIR`
- `title_slug` and `short_key` are stored path components, not the authoritative identity
- `normalized_audio_url` is optional lookup/debug metadata, not a substitute for `audio_fingerprint`
- `status` must distinguish at least reusable vs non-reusable assets if the first implementation chooses to model it

Required boundary:
- SQLite stores transcript asset metadata only
- the transcript payload itself lives on disk as a compressed JSON file

## 5. Optional Future Tables

## 5.1 Optional `asr_builtin_usage_daily`

This table is optional in `023`.

Use it only if:
- current-day ops summary queries would otherwise become noisy or slow
- you want to compact older request-level rows later without losing totals

Recommended shape:

```sql
CREATE TABLE asr_builtin_usage_daily (
  day_key_utc TEXT PRIMARY KEY,
  reserved_seconds INTEGER NOT NULL DEFAULT 0,
  consumed_seconds INTEGER NOT NULL DEFAULT 0,
  released_seconds INTEGER NOT NULL DEFAULT 0,
  failed_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
```

If introduced:
- this table is a derived summary, not the source of truth
- request-level rows remain authoritative for idempotency and recent-day debugging

## 5.2 Optional `asr_builtin_admin_audit`

This table is optional in `023`.

It should be deferred if:
- the deployment has a single operator
- simple admin mutation logging is sufficient
- you want to avoid over-designing governance before there is a real multi-operator need

If introduced later, a minimal shape is enough:

```sql
CREATE TABLE asr_builtin_admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor_hint TEXT,
  created_at TEXT NOT NULL
);
```

This table is intentionally narrow in the current plan. Do not add rich audit payloads unless a real operational requirement appears.

## 6. Required Indexes

Beyond the required unique index above, add:

```sql
CREATE INDEX idx_asr_builtin_usage_day_status
ON asr_builtin_usage_requests(day_key_utc, status);

CREATE INDEX idx_asr_builtin_usage_status_expires
ON asr_builtin_usage_requests(status, expires_at);

CREATE INDEX idx_asr_builtin_usage_reserved_at
ON asr_builtin_usage_requests(reserved_at DESC);
```

For shared transcript assets, add:

```sql
CREATE INDEX idx_asr_transcript_artifacts_itunes_id
ON asr_transcript_artifacts(itunes_id);

CREATE INDEX idx_asr_transcript_artifacts_audio_fingerprint
ON asr_transcript_artifacts(audio_fingerprint);

CREATE INDEX idx_asr_transcript_artifacts_last_accessed_at
ON asr_transcript_artifacts(last_accessed_at);
```

If the optional audit table is implemented later:

```sql
CREATE INDEX idx_asr_builtin_audit_created_at
ON asr_builtin_admin_audit(created_at DESC);
```

## 7. Reservation Expiry Contract

The schema must support stale-reservation recovery.

That means:
- `expires_at` is required on `reserved` rows
- stale `reserved` rows must be sweepable after crash/restart or lost finalization
- sweeps must convert stale rows into `released` so the terminal state is consistent with the `023` contract

This document does not define the sweeper cadence itself, but the schema must support it cleanly.

## 8. Concurrency And Multi-Instance Assumption

This schema is intended to support **deployment-global** quota and concurrency enforcement.

That means:
- do not design it around process-local counters as the source of truth
- idempotency, reservation insertion, and quota checks must be expressible through SQLite-backed coordination

If `023` later chooses to explicitly scope correctness to a single `cloud-api` writer, that must be stated in `023`, not assumed implicitly in this schema document.

## 9. Retention Expectations

Default retention guidance for `023`:
- request-level usage rows: finite retention, for example 30-90 days
- optional audit rows: longer retention than usage rows if the audit table is implemented
- optional daily summary rows: may be retained longer if needed for coarse reporting

This document does not force exact numbers, but it does require the implementation to differentiate:
- short-lived operational usage detail
- longer-lived admin audit history

## 10. Migration Seam For `023b`

`023c` must not pretend subject identity is already solved.

- `023` does not need to store a nullable subject placeholder if identity is still unsettled.
- `023b` owns any future authoritative subject tables and policy tables.
- The additive migration path should start from the two core tables above, not from speculative pseudo-identity columns.

This document deliberately avoids creating per-subject quota tables now.

## 11. Do Not

- Do not store Cloudflare credentials in SQLite.
- Do not build a generic config subsystem for one built-in ASR feature.
- Do not store large inline transcript text in SQLite.
- Do not store raw audio blobs or raw uploaded audio payloads.
- Do not make request-level audit/state rows unbounded without a retention strategy.
- Do not add speculative subject-identity columns before `023b` defines the model.

## 12. Recommended Implementation Order

1. Add schema migration for `asr_builtin_quota_config`
2. Add schema migration for `asr_builtin_usage_requests`
3. Add schema migration for `asr_transcript_artifacts` plus `transcript_key` linkage
4. Add repository/helpers for policy read/write, reservation insert/finalize, and transcript-asset lookup/linking
5. Only then wire built-in ASR provider execution on top of those primitives
6. Treat audit and daily summary tables as later add-ons if they become operationally necessary

This order reduces drift between quota logic and persistence.

## 13. Verification Expectations

At minimum, implementation should prove:

1. Empty DB + valid env credentials still yields built-in `disabled/not_configured`
2. Duplicate `request_id` on the same UTC day does not double-insert usage rows
3. Same `request_id` with different payload fingerprint is rejected
4. Shared transcript assets can be looked up deterministically without reading large inline SQLite blobs
5. Admin policy writes increment `version`
6. Stale `reserved` rows are queryable and recoverable

If an optional audit table is added later, test it then rather than forcing it into `023`.

## 14. Return

1. schema files added/changed
2. repository/helpers added/changed
3. final table/index shapes
4. bootstrap behavior implemented
5. verification results
