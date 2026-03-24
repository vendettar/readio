> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `agent/instructions/lite/084-harden-public-proxy-controls.md`, `apps/docs/content/docs/general/security.mdx`, and `apps/docs/content/docs/apps/lite/handoff/environment.mdx` before starting.

# Task: 084b - Enable Multi-Dimensional Proxy Rate Limits and 429 Policy

## Objective
Harden Readio Lite public proxy against abuse by adding production-safe rate limiting with low false-positive risk and clear 429 semantics.

## Constraint Check
- Build on top of 084 POST-only proxy contract.
- Do not introduce client-visible auth/secrets changes.
- Do not add new product dependencies in Lite app.

## Scope Scan (Pre-Implementation)
- **Config**: Worker env thresholds and route/path policy.
- **Persistence**: No DB/schema changes.
- **Routing**: Worker route-level limit policy only.
- **Logging**: Add limited event fields for tuning and audit.
- **Network**: 429 + `Retry-After` contract.
- **Storage**: Optional KV for lightweight counters if needed.
- **UI State**: Optional toast copy update for 429 only.
- **Tests**: Worker/lite tests for rate-limit behavior.

## Required Implementation
1. **Edge limit (primary)**
- Configure Cloudflare Rate Limiting rule for proxy path.
- Baseline key: `IP + path`.
- Return status must be `429`.

2. **Worker limit (secondary burst guard)**
- Add short-window burst protection in Worker (or Worker+KV) to reduce abuse spikes.
- Keep it fail-closed: on guard hit return `429` with `Retry-After` seconds.
- Do not block `OPTIONS` preflight via secondary guard.

3. **Multi-dimensional observability (not trust signal)**
- Log hashed or redacted dimensions for tuning only:
  - client IP (already available),
  - token fingerprint/hash,
  - user agent hash,
  - optional `x-readio-version`.
- Explicitly state in code comments/docs: UA/version are advisory dimensions, not security identity.

4. **Response contract**
- On limit hit, return JSON: `{ "error": "rate_limited", "requestId": "..." }`.
- Include header: `Retry-After`.
- Keep existing error taxonomy (`400` format, `403` policy, `429` limit).

5. **Lite handling**
- Ensure Lite fetch layer handles `429` distinctly from generic network error.
- Surface deterministic user message and optional retry hint; no infinite retry loop.

## Verification
### Functional checks
- Non-limited requests still pass.
- Burst traffic hits `429` with `Retry-After`.
- OPTIONS preflight is not rate-limited by secondary guard.
- Logs include required dimensions without leaking raw token.

### Commands
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`

## Documentation Sync (Required)
Update both EN and ZH:
- `apps/docs/content/docs/general/security.mdx`
- `apps/docs/content/docs/general/security.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`

Must include:
- Primary/secondary rate-limit architecture.
- 429 + `Retry-After` contract.
- Advisory nature of UA/version dimensions.

## Impact Checklist
- **Affected modules**: Worker proxy file, Lite fetch error mapping, security/environment docs.
- **Regression risks**: Over-throttling shared IP networks; accidental preflight blocking.
- **Mitigation**: Conservative defaults + logs + staged rollout.

## Decision Log
- Required.

## Bilingual Sync
- Required.
