> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/security.mdx`, `apps/docs/content/docs/apps/lite/handoff/environment.mdx`, and `apps/docs/content/docs/apps/lite/coding-standards/data-fetching.mdx` before starting.

# Task: Harden Public Proxy with Guardrails, Rate Limits, and Auditability [COMPLETED]

## Objective
For Readio Lite (pure frontend), treat proxy credentials as non-secret and harden the proxy path through strict request constraints, abuse controls, and audit logging.

## Scope Scan (Pre-Implementation)
- **Config**: Runtime proxy config keys and defaults.
- **Persistence**: No DB schema changes.
- **Routing**: No app route changes.
- **Logging**: Add structured proxy event logging policy.
- **Network**: Proxy request/response constraints and retry behavior.
- **Storage**: No local storage format changes.
- **UI State**: Optional warning text only; no layout changes.
- **Tests**: Add/extend unit tests for proxy guard behavior.

## 1. Security Model Clarification (Required)
- **Rule**: Any value shipped to browser runtime config is public.
- **Action**: Update docs and comments to state that `READIO_CORS_PROXY_AUTH_VALUE` is **not** a secret store.
- **Rule**: If true secret protection is required, move secret to server-side proxy only.

## 2. Strict Proxy Request Constraints (Required)
Implement constraints in the proxy path (Cloudflare Worker side if present; otherwise enforce at Lite-side request builder where applicable):
- **Allowlist upstream hosts**: Only approved domains (e.g. iTunes search/feed domains and explicitly approved RSS hosts).
- **Allowlist caller origins**: Use explicit `ALLOWED_ORIGINS` (comma-separated allowlist).
  - Development phase may temporarily include `http://localhost:5173`.
  - Production must not include any localhost origin.
- **Method allowlist**: Only `OPTIONS` (preflight) and `POST` (client contract).
- **Upstream fetch method**: Worker fetches target via `GET` after validating POST body.
- **Body size cap**: Reject oversized request bodies.
- **Timeout cap**: Enforce request timeout upper bound.
- **Header allowlist**: Only forward approved headers; never forward cookies or arbitrary auth headers to unapproved upstreams.
- **URL policy**: Reject private/internal IP targets and non-HTTP(S) schemes.

## 3. Auth Header Behavior Consistency (Required)
- **Contract**: Client auth is carried only by request header (for example `x-proxy-token`), never by query param.
- **POST-only**: All client proxy calls use POST JSON body `{ "url": "..." }`.
- **No silent fallback**: Do not support GET fallback in client fetch path.

## 4. Rate Limiting and Abuse Controls (Phase 2)
- **Edge rate limit**: Configure Cloudflare Rate Limiting by path + IP.
- **Worker secondary guard**: Add per-IP/per-route counters with short windows for burst control.
- **Response policy**: Return `429` with `Retry-After` when limited.
- **Optional challenge**: Support Turnstile verification for high-cost routes.

## 5. Audit Logging (Required)
- **Structured logs**: Record request id, route, upstream host, status, latency, limited/blocked reason.
- **Redaction**: Never log full URLs with sensitive query params, auth headers, or body payloads.
- **Correlation**: Include trace/request IDs in both success and failure paths.

## 6. Caching and Cost Controls (Required)
- Cache safe upstream GET responses with bounded TTL.
- Client-side contract remains POST; cache key must be derived from normalized upstream URL.
- Skip cache for non-idempotent requests.

## 7. Lite-Side Runtime Config Guardrails (Required)
Update `apps/lite/src/lib/runtimeConfig.ts` and fetch layer behavior:
- Force custom proxy mode to POST JSON contract; no runtime GET mode.
- Fix auth header name to `x-proxy-token` to match Worker CORS contract.
- Validate that proxy auth value is present when auth header is configured.
- Keep `credentials: 'omit'` for proxy fetches.

## 8. Verification (Required)
### Unit/Integration Checks
- Allowed upstream host passes; disallowed host blocked.
- POST auth contract enforced; query token rejected.
- Logs are present and redacted.
- Production release guard fails when production `ALLOWED_ORIGINS` contains `localhost`.

### Command Checks
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`
- Add a release check command/script for production config:
  - Example: fail CI if production origin config matches `localhost`.

## 8.1 Phase 2 Verification (Not Required for 084 Done)
- Rate-limit path returns `429` and `Retry-After`.
- Turnstile challenge path is enforced on configured high-cost routes.

## 9. Documentation Sync (Required, Result State Only)
Update:
- `apps/docs/content/docs/general/security.mdx`
- `apps/docs/content/docs/general/security.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`

Must include:
- "Frontend config is public, not secret storage".
- "Public proxy hardening checklist" (allowlist, rate limit, logging, redaction).
- Explicit POST auth contract and failure behavior.
- "Development may temporarily allow localhost; production must remove localhost before release."

## Forbidden Dependencies
- Do not add heavyweight security frameworks unless explicitly approved.
- No new client-side secret storage mechanism.

## Required Patterns
- Explicit allowlist over denylist.
- Fail-closed on invalid target/method.
- Redaction-first logging.

## Completion

- **Completed by**: Antigravity (Worker)
- **Commands**: `pnpm -C apps/lite lint && pnpm -C apps/lite typecheck && pnpm -C apps/lite build && pnpm -C apps/lite test:run src/lib/__tests__/fetchUtils.test.ts`
- **Date**: 2026-02-07
- **Verification**: All checks passed (Lint ✓, Types ✓, Build ✓, Tests 10/10 ✓)

### Follow-up Fixes (Same Session)
1. **[P1] Production localhost guard**: Added `apps/lite/scripts/check-production-config.sh` + CI step to fail builds if production config contains localhost
2. **[P2] Example config cleanup**: Removed `READIO_CORS_PROXY_REQUEST_METHOD` from `env.local.js.example`, updated auth example to clarify public credential model
3. **[P2] Header merge security**: Fixed fetchUtils.ts header merge order to prevent caller headers from overriding Content-Type/auth headers
4. **[P1] vercel.json check enforcement**: Fixed production guard to fail (not warn) when vercel.json contains localhost in non-comment lines
