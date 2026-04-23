# Instruction 010 — Cloud Trusted Proxy Client IP And Rate-Limit Contract [COMPLETED]

## Parent context

This instruction follows:

- `003-cloud-lite-full-clone-bootstrap.md`
- `005-cloud-networking-cutover.md`
- `007-cloud-asr-fallback-cutover.md`
- `008-cloud-asr-provider-relay-cutover.md`
- `009-cloud-runtime-config-ownership-cutover.md`

It addresses a production deployment reality that is now known and concrete:

- browser
- Cloudflare orange proxy
- VPS nginx
- `apps/cloud-api` on `:8080`

Cloud is therefore running **behind trusted proxies**, and rate limiting based on `RemoteAddr` is no longer an acceptable production contract.

---

## Goal

Fix Cloud client-IP extraction and rate-limit granularity for proxy-backed deployment.

Target outcome:

1. nginx restores the real client IP from Cloudflare in a trusted way
2. `apps/cloud-api` derives the effective client IP from trusted proxy headers only when the immediate peer is a trusted proxy
3. both `/api/proxy` and ASR relay use the same effective client-IP helper for rate limiting
4. deployment docs explicitly document the production chain:
   - Cloudflare -> nginx -> Go
5. the backend does **not** trust arbitrary client-supplied `X-Forwarded-For` / `X-Real-IP`

---

## Non-goals

Do **not** do any of these in this instruction:

- do not redesign ASR security
- do not redesign `/api/proxy`
- do not add auth/session/login
- do not change Cloudflare product settings beyond what nginx must expect
- do not broaden trusted proxy behavior to all headers from all sources

---

## Problem statement

Current Cloud rate limiting relies on `RemoteAddr`.

That is wrong for the actual production chain:

- Go sees nginx as the peer
- nginx sees Cloudflare as the peer unless real-ip handling is configured
- the real user IP is therefore lost unless restored intentionally

If left unchanged:

- all users can collapse into one rate-limit bucket
- ASR relay and `/api/proxy` can falsely rate-limit unrelated users
- production abuse controls become noisy and inaccurate

---

## Required architecture

### 1. nginx owns the first real-IP restoration step

nginx must be documented and configured to:

- trust Cloudflare IP ranges only
- use `CF-Connecting-IP` as the real-ip source
- forward the restored client IP to Go through `X-Real-IP`
- continue forwarding `X-Forwarded-For`, `X-Forwarded-Proto`, and `Host`

This instruction must **not** assume Go can safely trust Cloudflare headers directly from the public internet.

### 2. Go trusts forwarded client IP only from trusted proxies

`apps/cloud-api` must introduce a single helper for effective client-IP derivation.

Required behavior:

1. inspect `RemoteAddr`
2. if the immediate peer is **not** in trusted proxy CIDRs:
   - use `RemoteAddr`
   - ignore `X-Real-IP` and `X-Forwarded-For`
3. if the immediate peer **is** in trusted proxy CIDRs:
   - prefer `X-Real-IP`
   - optionally fall back to the first valid entry in `X-Forwarded-For`
   - otherwise fall back to `RemoteAddr`

This helper becomes the only supported way to derive rate-limit identity.

In the current `Cloudflare -> nginx -> Go` deployment topology, the backend trusted-proxy list must represent the immediate trusted hop that talks to Go (for example loopback, nginx private interface, or another explicit local/private reverse-proxy hop). Do **not** copy Cloudflare public CIDR ranges into `READIO_TRUSTED_PROXY_CIDRS` for the Go process in this topology.

### 3. Shared use across Cloud backend surfaces

At minimum, both of these must switch to the shared helper:

- `/api/proxy`
- ASR relay

Do not leave one path on `RemoteAddr` while the other uses trusted proxy extraction.

---

## Required runtime config

Introduce backend runtime config for trusted proxies.

Preferred naming:

- `READIO_TRUSTED_PROXY_CIDRS`

Expected format:

- comma-separated CIDRs
- example:
  - `127.0.0.1/32,::1/128`

Behavior:

- invalid entries must not panic the process
- ignored/invalid entries should be handled defensively
- trusted CIDRs must be parsed once at startup/runtime-config load time and reused on requests; do not parse CIDRs on every request
- ignored/invalid CIDR entries must produce visible operator-facing logging or warning output so misconfiguration is observable
- empty value means:
  - no trusted proxy headers are honored
  - backend falls back to `RemoteAddr`

Do **not** expose this setting to browser `/env.js`.

---

## nginx deployment contract

Instruction implementation must update deployment docs with a concrete nginx guidance section.

At minimum document:

1. Cloudflare -> nginx -> Go chain
2. `real_ip_header CF-Connecting-IP;`
3. `real_ip_recursive on;`
4. `set_real_ip_from ...` for Cloudflare IP ranges
5. `proxy_set_header X-Real-IP $remote_addr;`
6. `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
7. `proxy_set_header X-Forwarded-Proto $scheme;`
8. `proxy_set_header Host $host;`

If exact Cloudflare IP ranges are not embedded in docs, link/document how operators must keep them current.

Do not silently imply that arbitrary proxies are trusted.

---

## Implementation requirements

### Backend

Likely files:

- `apps/cloud-api/main.go`
- `apps/cloud-api/asr_relay.go`
- new helper file if useful
- backend tests

Required qualities:

- one shared effective-client-IP helper
- strict parsing of CIDRs
- startup-time compiled/cached trusted CIDR set
- visible logging for ignored invalid CIDR entries
- no blind trust of `X-Forwarded-For`
- stable fallback behavior
- clear unit tests for:
  - direct peer, no trusted proxy
  - trusted proxy + valid `X-Real-IP`
  - trusted proxy + invalid `X-Real-IP`
  - trusted proxy + `X-Forwarded-For`
  - trusted proxy + multi-entry `X-Forwarded-For` chain with explicit chosen client IP behavior
  - untrusted peer attempting to spoof headers

### Docs

Update Cloud deployment docs and any runtime contract docs that discuss rate limiting or relay behavior.

Explicitly document:

- trusted-proxy requirement
- nginx real-ip expectation
- backend runtime variable for trusted proxy CIDRs

---

## Testing requirements

At minimum add or update tests that prove:

1. untrusted peer cannot spoof `X-Real-IP`
2. trusted local nginx peer can forward client IP
3. `/api/proxy` rate limiting uses effective client IP
4. ASR relay rate limiting uses effective client IP
5. empty trusted-proxy config falls back to `RemoteAddr`

Use deterministic tests; do not rely on real nginx or Cloudflare during unit tests.

---

## Verification

Run at minimum:

1. `go test ./...` in `apps/cloud-api`
2. any impacted Cloud docs build or docs validation command if already standard in repo

Manual verification target:

1. nginx configured with real-ip restoration
2. Cloud backend behind nginx on `:8080`
3. repeated requests from two simulated client IPs do not collapse into one bucket when forwarded through trusted proxy headers

---

## Done when

- rate limiting no longer keys only on raw `RemoteAddr` in proxy-backed production
- `/api/proxy` and ASR relay share the same effective client-IP logic
- trusted proxy CIDRs are backend-configurable
- deployment docs explicitly describe the Cloudflare -> nginx -> Go trust chain
- tests prove untrusted peers cannot spoof forwarded client IP headers

---

## Final handoff format

Return:

1. files changed
2. effective client-IP extraction contract
3. trusted proxy runtime config added
4. nginx deployment contract added
5. tests added/updated
6. verification commands run and results
7. any residual operational follow-up required on the VPS

## Completion

- Completed by: Worker
- Reviewed by: Reviewer
- Commands:
  - `go test ./...` (apps/cloud-api) — PASS
  - `go vet ./...` (apps/cloud-api) — PASS
  - `go build ./...` (apps/cloud-api) — PASS
- Date: 2026-03-31

### Final handoff

**Files changed:**
- `apps/cloud-api/clientip.go` (created) — shared effective-client-IP helper
- `apps/cloud-api/clientip_test.go` (created) — 15 test cases
- `apps/cloud-api/main.go` — trustedProxies in proxyService, effectiveClientIP for rate limiting
- `apps/cloud-api/asr_relay.go` — trustedProxies in asrRelayService, effectiveClientIP for rate limiting
- `apps/docs/content/docs/apps/cloud/deployment.mdx` — Section 7: trusted proxy contract, nginx config, layered abuse control
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx` — zh counterpart
- `apps/docs/content/docs/apps/cloud/handoff/runtime-config-ownership-audit.md` — READIO_TRUSTED_PROXY_CIDRS added to server-owned table
- `apps/docs/content/docs/apps/cloud/handoff/runtime-config-ownership-audit.zh.mdx` — zh counterpart

**Effective client-IP extraction contract:**
- If immediate peer is NOT in trusted proxy set: use RemoteAddr, ignore forwarded headers
- If immediate peer IS in trusted proxy set: prefer X-Real-IP, then first valid X-Forwarded-For entry, then RemoteAddr

**Trusted proxy runtime config:**
- `READIO_TRUSTED_PROXY_CIDRS` — comma-separated CIDRs (e.g. `127.0.0.1/32,::1/128`), backend-only, empty default, parsed once at startup

**Residual operational follow-up:**
- VPS operator must set `READIO_TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128` in `/etc/readio/readio-cloud.env`
- nginx must be configured with `real_ip_header CF-Connecting-IP` and Cloudflare `set_real_ip_from` ranges (keep Cloudflare CIDRs current)
- After deployment, verify two distinct client IPs produce separate rate-limit buckets
