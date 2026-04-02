# Instruction 014a — Cloud Admin Backend: Ring Buffer, Endpoints, Auth, Metrics

Execute as part of 014 (Cloud Lightweight Admin Observability).

## Scope

Backend only:
- `apps/cloud-api/admin.go` — ring buffer, slog handler, API endpoints, auth, metrics
- `apps/cloud-api/admin_test.go` — tests

## Must

### 1. Ring Buffer Slog Handler

Create a custom `slog.Handler` that wraps the existing default handler and simultaneously writes to an in-memory ring buffer.

Requirements:
- Fixed capacity (default: 2000, configurable via `READIO_ADMIN_LOG_BUFFER`)
- Enforce bounds: min 100, max 10000, invalid values fall back to 2000
- Thread-safe (sync.RWMutex)
- Stores structured attributes as flat key-value pairs
- Each entry: `{ timestamp, level, message, attrs map[string]string }`
- Ring semantics: oldest overwritten when full
- Existing stdout logging MUST NOT be disrupted
- Cap stored attr count per entry: first 32 flattened attrs only
- Truncate long string attr values: 512 bytes max per value

### 1.1 Sensitive Data Handling

Never store or expose values for keys matching these case-insensitive patterns:
- `authorization`, `api_key`, `token`, `secret`, `cookie`, `set-cookie`, `x-readio-cloud-secret`, `x-readio-relay-public-token`

Redact matching values as `[REDACTED]`.

Normalize key matching by: lowercasing, treating `-`, `_`, camelCase boundaries as equivalent.
- `apiKey`, `relayPublicToken`, `workerSharedSecret`, `xReadioCloudSecret` must all redact.

`slog.Group` values must be flattened deterministically: `group.key=value`.

### 1.2 Canonical Request Log Contract

`/admin/metrics/summary` is computed from buffered request-scoped logs only.

Canonical fields: `route`, `elapsed_ms`, `error_class`, `status`

Stable route names:
- `asr-relay/transcriptions`, `asr-relay/verify`
- `discovery/top-podcasts`, `discovery/top-episodes`
- `discovery/search/podcasts`, `discovery/search/episodes`
- `discovery/lookup/podcast`, `discovery/lookup/podcast-episodes`
- `discovery/feed`
- `proxy/media`

Rules:
- Logs missing `route` excluded from route summary
- Logs missing `elapsed_ms` excluded from latency/p95
- `/admin/*` requests excluded from ring buffer and summary entirely

### 2. API Endpoints

Auth: `READIO_ADMIN_TOKEN` env var (Bearer token). Empty = disabled (404). Missing/invalid token = 401.

| Endpoint | Method | Description |
|---|---|---|
| `/admin/logs` | GET | Recent entries, newest first |
| `/admin/logs?level=error` | GET | Filter by level |
| `/admin/logs?route=asr-relay` | GET | Filter by route |
| `/admin/logs?error_class=timeout` | GET | Filter by error_class |
| `/admin/logs?limit=100` | GET | Limit (default 200, max 500) |
| `/admin/health` | GET | Uptime, buffer size, Go version, mem stats |
| `/admin/metrics/summary` | GET | Aggregated counters by route and error_class |

Response rules:
- All responses include `Cache-Control: no-store` + `Pragma: no-cache`
- No CORS headers on `/admin/*`
- Stable canonical fields as top-level keys, extra attrs under `attrs` object
- `/admin/logs` returns newest first (`ts desc`)

### 3. Metrics Aggregation

Compute `/admin/metrics/summary` from ring buffer on each request. No separate counters.
- Aggregation over current visible ring buffer window only
- `p95_ms` computed from buffered samples
- Eviction makes totals intentionally approximate
- Summary is for debugging, not billing/SLA

### 4. Wiring

- Install ring buffer slog handler at startup (before mux creation)
- Register `/admin/*` before SPA/static fallback
- Admin layer is additive — must not change existing behavior

### 5. Environment Variables

| Var | Default | Description |
|---|---|---|
| `READIO_ADMIN_TOKEN` | (empty = disabled) | Bearer token |
| `READIO_ADMIN_LOG_BUFFER` | 2000 | Ring buffer capacity |

Both server-owned. NOT in `browserEnvAllowlist`.

## Do not

- Do not add external dependencies
- Do not modify existing slog output format
- Do not expose admin endpoints to browser `/env.js`

## Tests

1. Ring buffer overflow behavior
2. Ring buffer thread safety (concurrent writes)
3. `/admin/logs` filtering by level, route, error_class
4. `/admin/logs` auth: missing token → 401, invalid token → 401
5. `/admin/health` returns uptime and buffer stats
6. `/admin/metrics/summary` aggregation correctness
7. Disabled when `READIO_ADMIN_TOKEN` empty → 404
8. Sensitive attr redaction (apiKey, token, secret, cookie, camelCase variants)
9. Long attr truncation
10. Invalid `READIO_ADMIN_LOG_BUFFER` falls back safely
11. `/admin/*` responses include `Cache-Control: no-store`
12. Summary ignores entries missing canonical route/elapsed
13. `/admin/*` requests do not pollute summary metrics

## Verify

- `cd apps/cloud-api && go test ./...`
- `cd apps/cloud-api && go vet ./...`
- `cd apps/cloud-api && go build ./...`

## Return

1. files changed
2. endpoints and contracts
3. ring buffer capacity and eviction
4. sensitive redaction keys
5. tests added
6. verification results
