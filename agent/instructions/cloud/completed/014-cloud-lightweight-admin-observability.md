# Instruction 014 — Cloud Lightweight Admin Observability [COMPLETED]

## Goal
Add a lightweight, self-contained admin observability layer to `apps/cloud-api` and `apps/cloud-ui` so that ASR relay success/failure, discovery upstream errors, rate-limit disables, and slow requests are visible from a browser — without external dependencies (no Loki, no Prometheus, no Redis).

## Scope

Backend:
- `apps/cloud-api/admin.go` — ring buffer + slog handler + API endpoints
- `apps/cloud-api/admin_test.go` — ring buffer and endpoint tests

Frontend:
- `apps/cloud-ui/src/routeComponents/AdminLogsPage.tsx` — log table with filters
- `apps/cloud-ui/src/lib/adminApi.ts` — API client

Docs (if runtime contract changes):
- `apps/docs/content/docs/apps/cloud/deployment.mdx` — admin access note

This instruction adds a real runtime contract. Deployment docs are required, not optional.

## Must

### 1. Backend — Ring Buffer Slog Handler

Create a custom `slog.Handler` that wraps the existing default handler and simultaneously writes to an in-memory ring buffer.

Requirements:
- Fixed capacity (default: 2000 entries, configurable via `READIO_ADMIN_LOG_BUFFER` env var)
- Enforce bounds on `READIO_ADMIN_LOG_BUFFER`: min `100`, max `10000`, invalid values fall back to `2000`
- Thread-safe (sync.RWMutex or lock-free)
- Stores structured attributes as flat key-value pairs (not raw slog.Attr)
- Each entry: `{ timestamp, level, message, attrs map[string]string }`
- Oldest entries are overwritten when buffer is full (ring semantics)
- The existing stdout logging must NOT be disrupted — the ring buffer is additive
- Cap stored attr count per entry (for example: first 32 flattened attrs only)
- Truncate long string attr values before buffering (for example: 512 bytes max per value)

### 1.1 Sensitive Data Handling

The ring buffer is for operator diagnosis only. It must not become a secret sink.

Hard rules:
- Never store or expose values for keys matching these case-insensitive patterns:
  - `authorization`
  - `api_key`
  - `token`
  - `secret`
  - `cookie`
  - `set-cookie`
  - `x-readio-cloud-secret`
  - `x-readio-relay-public-token`
- Redact matching values as `[REDACTED]`
- Do not store request bodies, response bodies, multipart field contents, or transcript text in the ring buffer
- If an existing log line includes large freeform snippets, store only the truncated/redacted value in the admin buffer while leaving stdout behavior unchanged

### 1.2 Canonical Request Log Contract

`/admin/metrics/summary` is computed from buffered request-scoped logs only. To avoid meaningless aggregation, participating entries MUST use stable field names.

Canonical fields:
- `route`
- `elapsed_ms`
- `error_class`
- `status` (when available)

Stable route names should be normalized to a small backend-owned set, for example:
- `asr-relay/transcriptions`
- `asr-relay/verify`
- `discovery/top-podcasts`
- `discovery/top-episodes`
- `discovery/search/podcasts`
- `discovery/search/episodes`
- `discovery/lookup/podcast`
- `discovery/lookup/podcast-episodes`
- `discovery/feed`
- `proxy/media`

Rules:
- Logs missing `route` are excluded from route summary
- Logs missing `elapsed_ms` are excluded from latency summary/p95
- Logs missing `error_class` count as non-error unless HTTP status indicates an error class the implementation can derive safely
- The admin layer must not attempt to infer product metrics from arbitrary non-canonical logs
- Canonical request-scoped logs must be emitted explicitly by the backend-owned request surfaces that participate in summary metrics. At minimum this includes:
  - ASR relay request paths in `apps/cloud-api/asr_relay.go`
  - discovery request paths in `apps/cloud-api/discovery_apple.go`
  - feed request paths in `apps/cloud-api/discovery_feed.go`
  - proxy/media request paths only if the implementation intentionally includes them in the canonical summary set
- `/admin/*` requests must not contribute to admin summary metrics
- Prefer excluding `/admin/*` from the ring buffer entirely; if they are buffered for debugging, they must still be excluded from `/admin/metrics/summary`

### 2. Backend — API Endpoints

All endpoints require authentication via `READIO_ADMIN_TOKEN` env var (Bearer token in Authorization header). If `READIO_ADMIN_TOKEN` is empty, endpoints are disabled (return 404).

| Endpoint | Method | Description |
|---|---|---|
| `/admin/logs` | GET | Recent log entries (JSON array) |
| `/admin/logs?level=error` | GET | Filter by level |
| `/admin/logs?route=asr-relay` | GET | Filter by route field |
| `/admin/logs?error_class=timeout` | GET | Filter by error_class field |
| `/admin/logs?limit=100` | GET | Limit results (default 200, max 500) |
| `/admin/health` | GET | Server uptime, buffer size, Go version, memory stats |
| `/admin/metrics/summary` | GET | Aggregated counters: total requests by route, error count by error_class, p95 latency by route |

Security/response rules:
- `READIO_ADMIN_TOKEN` unset: all `/admin/*` endpoints return `404`
- `READIO_ADMIN_TOKEN` set but Authorization missing/invalid: return `401`
- All admin responses must include `Cache-Control: no-store`
- Add `Pragma: no-cache` for compatibility
- Do not add permissive CORS headers to `/admin/*`
- These endpoints are same-origin operator tools only; do not expose any admin URL/token material via `/env.js`

Response format for `/admin/logs`:
```json
{
  "entries": [
    {
      "ts": "2026-04-02T10:00:00Z",
      "level": "WARN",
      "msg": "discovery request",
      "route": "discovery/search/podcasts",
      "upstream_kind": "apple-search",
      "upstream_host": "itunes.apple.com",
      "elapsed_ms": 8234,
      "error_class": "timeout"
    }
  ],
  "total": 1847,
  "buffer_capacity": 2000
}
```

Response/ordering rules for `/admin/logs`:
- Return newest entries first (`ts desc`)
- `limit` applies to the returned newest-first slice
- Stable canonical fields (`ts`, `level`, `msg`, `route`, `elapsed_ms`, `error_class`, `status`) should appear as top-level keys when present
- Additional non-canonical attributes should remain available under an `attrs` object

Response format for `/admin/metrics/summary`:
```json
{
  "uptime_seconds": 3600,
  "total_requests": 1234,
  "by_route": {
    "discovery/search/podcasts": { "count": 500, "errors": 12, "p95_ms": 3200 },
    "asr-relay": { "count": 200, "errors": 5, "p95_ms": 1500 }
  },
  "by_error_class": {
    "timeout": 8,
    "upstream_status": 5,
    "decode": 4
  }
}
```

### 3. Backend — Metrics Aggregation

Compute `/admin/metrics/summary` from the ring buffer on each request. Do NOT maintain separate counters (simplicity over precision). Accept that ring buffer eviction means counters are approximate — this is intentional for a lightweight admin.

Clarifications:
- Aggregation is performed only over the current visible ring buffer window
- Eviction makes totals intentionally lossy
- `p95_ms` is computed from the currently buffered sample only
- This summary is for debugging and operator visibility, not for billing, quota enforcement, or SLA reporting

### 4. Backend — Wiring

- In `main.go`, install the ring buffer slog handler at startup (before creating the mux)
- Register `/admin/*` routes in `ServeHTTP` or as a separate handler
- The admin handler MUST be registered before the SPA/static fallback

Implementation note:
- Keep the admin observability layer additive. It must not change existing request behavior, response contracts, or stdout log formatting semantics.

### 5. Frontend — Admin Logs Page

Create a minimal React page at a route that does NOT conflict with backend `/admin/*` JSON APIs.

Recommended:
- `/ops`
- or `/internal/admin`

Do not use:
- `/admin/logs` as the frontend page route
- any frontend route that collides with backend `/admin/*` endpoints

Features:
- Table with columns: Time, Level, Message, Route, Upstream, Elapsed, Error Class
- Level filter dropdown (All / INFO / WARN / ERROR)
- Route filter dropdown (populated from actual data)
- Auto-refresh toggle (poll every 10s)
- Manual refresh button
- Token input (stored in sessionStorage, not persisted)
- Explicit unauthorized/error state when token is missing or invalid
- Auto-refresh must stop or back off after repeated `401` responses

Do NOT:
- Do not add to the main navigation (access by direct URL only)
- Do not add auth/session logic beyond the Bearer token
- Do not add charts or graphs (keep it minimal)
- Do not put the admin token in the URL, query string, or persisted app config

### 6. Environment Variables

| Var | Default | Description |
|---|---|---|
| `READIO_ADMIN_TOKEN` | (empty = disabled) | Bearer token for admin endpoints |
| `READIO_ADMIN_LOG_BUFFER` | 2000 | Ring buffer capacity |

Both are server-owned. Do NOT add to `browserEnvAllowlist`.

## Redaction / Flattening Clarifications

- Sensitive-key matching must run on normalized key names, not only raw spellings
- Normalize by:
  - lowercasing
  - treating `-`, `_`, and camelCase boundaries as equivalent for matching purposes
- Example keys that must still redact under normalization:
  - `apiKey`
  - `relayPublicToken`
  - `workerSharedSecret`
  - `xReadioCloudSecret`
- `slog.Group` values must be flattened deterministically, for example `group.key=value`

## Do not

- Do not add Redis, SQLite, or any external dependency
- Do not modify existing slog output format
- Do not add auth/session middleware
- Do not create a separate Go binary
- Do not expose admin endpoints to browser `/env.js`
- Do not add historical persistence for admin logs or metrics
- Do not turn approximate admin metrics into product/business analytics

## Tests

1. Ring buffer overflow behavior (entries > capacity)
2. Ring buffer thread safety (concurrent writes)
3. `/admin/logs` filtering by level, route, error_class
4. `/admin/logs` auth rejects missing/invalid token
5. `/admin/health` returns uptime and buffer stats
6. `/admin/metrics/summary` aggregation correctness
7. Disabled when `READIO_ADMIN_TOKEN` is empty (404)
8. Sensitive attr redaction
9. Long attr truncation
10. Invalid `READIO_ADMIN_LOG_BUFFER` falls back safely
11. `/admin/*` responses include `Cache-Control: no-store`
12. Summary ignores entries missing canonical route/elapsed fields where appropriate
13. `/admin/*` requests do not pollute summary metrics
14. Frontend admin token is stored only in `sessionStorage`
15. Frontend auto-refresh stops or backs off after repeated `401` responses
16. Frontend route does not conflict with backend `/admin/*` APIs

## Verify

- `cd apps/cloud-api && go test ./...`
- `cd apps/cloud-api && go vet ./...`
- `pnpm -C apps/cloud-ui build`

Focused frontend checks are also required for:
- token-missing / unauthorized state
- repeated `401` auto-refresh backoff or stop behavior
- filter/query mapping into `/admin/logs`

## Done When

- Admin endpoints are protected by `READIO_ADMIN_TOKEN` with correct `404`/`401` behavior
- Ring buffer remains bounded and thread-safe under concurrent writes
- Sensitive values are redacted before entering the admin buffer
- Summary metrics are computed only from canonical request-scoped log fields
- Frontend admin page can inspect recent logs without modifying the main navigation or colliding with backend `/admin/*` APIs
- Deployment docs document the new env vars and operator-only access model

## Deployment Note

- Deployment docs must explicitly state that `/admin/*` is an operator-only same-origin surface
- `READIO_ADMIN_TOKEN` remains server-only and must never be emitted via `/env.js`
- Deployment docs should recommend additional outer-layer access reduction for `/admin/*` (for example nginx or Cloudflare path restrictions), but that hardening is documentation-scope unless separately implemented

## Return

1. files changed
2. admin endpoints and their contracts
3. ring buffer capacity and eviction behavior
4. tests added
5. verification results
6. residual notes

## Completion

- Completed by: Worker (2 phases)
- Reviewed by: Security, Refactor, Reviewer (per phase)
- Commands:
  - `go test ./...` (apps/cloud-api) — PASS
  - `go vet ./...` (apps/cloud-api) — clean
  - `go build ./...` (apps/cloud-api) — clean
  - `pnpm -C apps/cloud-ui build` — PASS
- Date: 2026-04-02

### Phase Summary

**014a — Backend:**
- `apps/cloud-api/admin.go` — ring buffer (2000 default, 100-10000 bounds), slog handler (additive), 3 endpoints (/admin/logs, /admin/health, /admin/metrics/summary), Bearer auth (constant-time compare), sensitive redaction (8 patterns + camelCase), /admin/* exclusion from buffer/summary
- `apps/cloud-api/admin_test.go` — 20 tests covering overflow, concurrency, filtering, auth, redaction, truncation, bounds, cache headers, summary exclusion
- `apps/cloud-api/main.go` — admin handler wired before SPA fallback

**014b — Frontend + Docs:**
- `apps/cloud-ui/src/lib/adminApi.ts` — fetchAdminLogs, fetchAdminHealth, fetchAdminMetricsSummary
- `apps/cloud-ui/src/routeComponents/AdminLogsPage.tsx` — token gate, HealthBar, FilterBar, LogTable, auto-refresh with 401 backoff (3 consecutive)
- `apps/cloud-ui/src/routes/ops.tsx` — lazy-loaded route at `/ops`
- Deployment docs updated (EN + ZH): READIO_ADMIN_TOKEN, READIO_ADMIN_LOG_BUFFER, operator-only access

### Environment Variables

| Var | Default | Description |
|---|---|---|
| `READIO_ADMIN_TOKEN` | (empty = disabled) | Bearer token |
| `READIO_ADMIN_LOG_BUFFER` | 2000 | Ring buffer capacity |

### Residual Notes
- fetchAdminMetricsSummary is exported but not yet surfaced in UI — can be added as a collapsible panel later
- Route filter derives from current entries only; may miss routes if filtered by level first
