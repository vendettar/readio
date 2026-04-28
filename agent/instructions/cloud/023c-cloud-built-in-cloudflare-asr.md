# Instruction 023c: Cloud Built-In Cloudflare ASR

Discuss and approve this document before implementation.

This is the product/feature instruction for built-in Cloudflare ASR in Cloud.

It depends on:
- `023a` for SQLite/goose/shared-data foundation
- `023b` for podcast transcript asset storage/reuse

## 1. Purpose

Cloud currently relies on user BYOK ASR flows such as Groq.

This instruction adds a backend-owned built-in Cloudflare ASR path so ordinary users can transcribe without entering a provider key.

## 2. Decisions

- Built-in Cloudflare ASR is backend-owned, not BYOK.
- If a valid user-owned provider/key is configured, that BYOK path still takes precedence by default.
- Built-in uses deployment-global daily quota plus in-flight concurrency control.
- Built-in request identity and quota/idempotency remain request-scoped.
- Successful built-in output must link to shared transcript assets from `023b`.

## 3. User-Facing Behavior

- Users without a valid BYOK setup should be able to trigger ASR without entering a key.
- Built-in should be clearly labeled as a Cloud-provided mode.
- When built-in quota is exhausted, users must see an explicit BYOK/setup action path.
- Built-in quota exhaustion must not silently fall through to another provider.

## 4. Routing Contract

Frontend sends:
- `asrMode = auto | builtin | byok`

Backend applies:
1. valid BYOK configured -> default to BYOK
2. else if built-in available -> use built-in
3. else -> block and ask for user-owned provider setup

Rules:
- `builtin` must reject if built-in unavailable
- `byok` must reject if BYOK invalid/missing
- backend remains authoritative

## 5. Built-In Status Contract

Expose a narrow readiness surface:

```text
GET /api/v1/asr/builtin/status
```

Allowed reasons:
- `healthy`
- `not_configured`
- `disabled`
- `quota_exhausted`
- `service_unavailable`

Do not expose:
- exact remaining quota
- exact daily limit
- reset timestamp
- backend credential detail

## 6. Error Contract

Built-in request handling must distinguish at minimum:
- `ASR_BUILTIN_NOT_CONFIGURED`
- `ASR_BUILTIN_DISABLED`
- `ASR_BUILTIN_QUOTA_EXCEEDED`
- `ASR_BUILTIN_BUSY`
- `ASR_BUILTIN_INVALID_PAYLOAD`
- `ASR_BUILTIN_SERVICE_UNAVAILABLE`

BYOK requests must keep their own error semantics.

## 7. Quota And Request Ledger

Built-in quota scope:
- global per deployment
- daily UTC boundary
- unit = estimated audio seconds

Request-level ledger remains required for:
- reservation
- finalize/release/fail transitions
- duplicate submit safety
- retry/idempotency correctness

Required request states:
- `reserved`
- `consumed`
- `released`
- `failed`

## 8. Request Identity vs Transcript Asset Reuse

These are separate contracts:

### Request identity
Prevents:
- duplicate quota consumption
- duplicate upstream execution during the same logical request

### Shared transcript asset
Allows:
- later viewers to reuse an existing transcript asset
- built-in success to link to one reusable backend-owned result

The implementation must not collapse these two identities into one field.

## 9. Persistence Expectations

Built-in ASR requires persistent backend storage for:
- mutable runtime quota policy
- request ledger
- linkage from built-in requests to shared transcript assets

Use Cloud SQLite for:
- `asr_builtin_quota_config`
- `asr_builtin_usage_requests`

Use `023b` transcript asset storage for:
- transcript file persistence
- transcript metadata indexing

## 10. Ops Surface

`/ops` must expose:
- `Logs`
- `ASR Usage`

`ASR Usage` should cover:
- built-in readiness
- mutable quota policy
- current-day usage summary
- recent usage events

## 11. Implementation Sequencing

1. Foundation from `023a`
2. Transcript asset storage from `023b`
3. Built-in backend execution path + public status endpoint
4. Request reservation/idempotency/quota enforcement
5. Frontend `auto/builtin/byok` UX and routing
6. `/ops` ASR Usage surface
7. Docs/tests sync

## 12. Verification

At minimum, implementation should prove:
- BYOK still works unchanged
- built-in works without user key input
- duplicate request identity does not double-consume quota
- built-in success links to reusable transcript assets
- later viewers reuse transcript assets instead of re-running ASR
- `/ops` can read and mutate built-in quota policy

## 13. Return

Implementation following this document should report:
1. routing contract changes
2. built-in status endpoint
3. quota/request-ledger behavior
4. transcript-asset linkage behavior
5. `/ops` ASR Usage results
6. verification results
