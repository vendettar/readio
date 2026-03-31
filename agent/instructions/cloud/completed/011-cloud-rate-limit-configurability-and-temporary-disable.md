# Instruction 011 — Cloud Rate-Limit Configurability And Temporary Disable [COMPLETED]

## Parent context

This instruction follows:

- `007-cloud-asr-fallback-cutover.md`
- `008-cloud-asr-provider-relay-cutover.md`
- `009-cloud-runtime-config-ownership-cutover.md`
- `010-cloud-trusted-proxy-client-ip-and-rate-limit.md`

It addresses a practical deployment problem:

- Cloud needs application-level rate limiting on `/api/proxy` and ASR relay
- current configuration is not equally configurable across both paths
- operators may need a temporary, explicit way to disable application-level limits during initial rollout

This task is about **configurability and operational control**, not about redesigning rate-limit identity or proxy trust behavior.

---

## Goal

Make Cloud application-level rate limiting configurable and temporarily disableable in a consistent, operator-friendly way.

Target outcome:

1. `/api/proxy` and ASR relay both read rate-limit settings from runtime config
2. both surfaces use the same enable/disable semantics
3. `> 0` means enabled with the configured limit
4. `<= 0` means application-level limiter is disabled for that surface
5. invalid config falls back to documented defaults
6. operators can temporarily disable app-layer limits to get production online, while relying on Cloudflare/nginx coarse protection

---

## Non-goals

Do **not** do any of these in this instruction:

- do not redesign trusted proxy extraction from `010`
- do not redesign `/api/proxy`
- do not redesign ASR security
- do not add auth, user quotas, or account-aware rate limits
- do not replace application-layer limits with Cloudflare-only or nginx-only protection
- do not change the deployment topology

---

## Problem statement

Current Cloud rate limiting is inconsistent:

- ASR relay already reads rate-limit values from runtime config
- `/api/proxy` still uses hardcoded limiter values
- ASR relay config parsing does not currently support an explicit disabled state

That creates two operational problems:

1. operators cannot tune both surfaces consistently from deployment config
2. operators cannot intentionally disable application-layer limits during a temporary rollout/debug window without code edits

This is a maintenance problem and a deployment problem.

Rate-limit numbers must not be buried in code if they are expected to change in production.

---

## Required runtime config contract

Add or normalize these backend runtime variables:

- `READIO_PROXY_RATE_LIMIT_BURST` (new)
- `READIO_PROXY_RATE_LIMIT_WINDOW_MS` (new)
- `READIO_ASR_RATE_LIMIT_BURST` (already exists in `asr_relay.go` — reuse, do not rename)
- `READIO_ASR_RATE_LIMIT_WINDOW_MS` (already exists in `asr_relay.go` — reuse, do not rename)

### Required semantics

For both `/api/proxy` and ASR relay:

- `BURST > 0`:
  - limiter enabled
  - use configured burst
- `BURST <= 0`:
  - limiter disabled for that surface
- `WINDOW_MS > 0`:
  - use configured window
- `WINDOW_MS <= 0` or invalid:
  - fall back to documented default window
- invalid numeric values:
  - fall back to documented defaults
  - should be handled defensively

### Required defaults

Keep existing production-safe defaults unless there is a documented reason to change them.

Current defaults:

| Surface | Default Burst | Default Window |
| --- | --- | --- |
| `/api/proxy` | 5 req/min | 1 minute |
| ASR relay | 60 req/min | 1 minute |

If defaults are retained, they must be exposed through parsing helpers rather than hardcoded directly at call sites.

### Required consistency

`/api/proxy` and ASR relay must use identical disable semantics:

- `BURST <= 0`: application-layer limiter is **disabled** for that surface (all requests pass)
- `WINDOW_MS <= 0` or invalid: fall back to the documented default window (does NOT disable)
- Only the BURST parameter controls enable/disable
- Invalid numeric values for either parameter: fall back to documented defaults

---

## Operational contract

This instruction explicitly supports a temporary rollout mode:

- application-layer rate limits may be disabled intentionally through config
- this is acceptable only as a temporary operational state
- Cloudflare and/or nginx should remain the outer coarse abuse-control layer during that period

The implementation must make this behavior explicit and reversible through env config, not through source edits.

Do **not** require code changes to turn rate limiting back on after rollout stabilization.

---

## Implementation requirements

Likely files:

- `apps/cloud-api/main.go`
- `apps/cloud-api/asr_relay.go`
- backend tests
- deployment docs if they mention limiter env values

Required qualities:

1. `/api/proxy` limiter creation must move to config parsing helpers (mirror the existing ASR pattern in `asr_relay.go`)
2. ASR relay limiter parsing must adopt the new disable semantics (`<=0` means disabled, not "fallback to default")
3. call sites must read parsed config, not literal numbers
4. defaults must remain centralized and reviewable
5. invalid config must not panic the process
6. behavior must be deterministic and testable

Note: `rateLimiter.allow()` already returns `true` when `limit <= 0` (main.go ~line 714). The disable behavior is built into the rate limiter struct; the task is to wire config parsing to produce `limit <= 0` when the operator sets burst to 0 or negative.

If helper functions are introduced, keep them local and explicit. Do not create a large shared config framework just for this task.

---

## Testing requirements

Start with tests that prove the current gap, then update implementation until they pass.

At minimum add or update deterministic tests for:

1. `/api/proxy` uses configured burst/window values
2. `/api/proxy` disables limiting when `READIO_PROXY_RATE_LIMIT_BURST <= 0`
3. ASR relay disables limiting when `READIO_ASR_RATE_LIMIT_BURST <= 0`
4. invalid burst values fall back to defaults
5. invalid window values fall back to defaults
6. both `/api/proxy` and ASR relay disable limiting when their respective burst env var is set to 0, and both re-enable when set to a positive value

Tests should prove behavior directly. Do not rely only on indirect smoke coverage.

---

## Verification

Run at minimum:

1. `go test ./...` in `apps/cloud-api`

If docs are updated, run the normal docs verification command only if one already exists in this repo.

---

## Return

When done, report:

1. files changed
2. final env vars supported
3. disable semantics implemented
4. defaults retained or changed
5. tests added/updated
6. verification results
7. any operational follow-up for production rollout

## Completion

- Completed by: Worker
- Reviewed by: Reviewer, Security
- Commands:
  - `go test ./...` (apps/cloud-api) — PASS
  - `go vet ./...` (apps/cloud-api) — PASS
- Date: 2026-03-31

### Files changed
- `apps/cloud-api/main.go` — `resolveProxyRateLimitBurst()`, `resolveProxyRateLimitWindow()`, disable logging in `newProxyService()`
- `apps/cloud-api/asr_relay.go` — updated `resolveASRRelayRateLimitBurst()` disable semantics, disable logging in `newASRRelayService()`
- `apps/cloud-api/main_test.go` — 4 test fixes/additions for proxy disable semantics
- `apps/docs/content/docs/apps/cloud/deployment.mdx` — proxy rate-limit env vars documented

### Env vars supported
| Var | Default | Semantics |
| --- | --- | --- |
| `READIO_PROXY_RATE_LIMIT_BURST` | 5 | `<= 0` disables; positive = configured burst |
| `READIO_PROXY_RATE_LIMIT_WINDOW_MS` | 60000 | `<= 0` or invalid = falls back to default |
| `READIO_ASR_RATE_LIMIT_BURST` | 60 | `<= 0` disables; positive = configured burst |
| `READIO_ASR_RATE_LIMIT_WINDOW_MS` | 60000 | `<= 0` or invalid = falls back to default |

### Disable semantics
- `BURST <= 0`: application-layer limiter disabled (all requests pass)
- `WINDOW_MS <= 0` or invalid: falls back to default window (does NOT disable)
- Both surfaces use identical semantics
- `slog.Warn` emitted when burst is disabled

### Operational follow-up
- Operators can set `READIO_PROXY_RATE_LIMIT_BURST=0` or `READIO_ASR_RATE_LIMIT_BURST=0` to temporarily disable app-layer limits during rollout
- Cloudflare/nginx remain outer coarse protection layer
- Re-enable by setting burst to positive value; no code changes needed
