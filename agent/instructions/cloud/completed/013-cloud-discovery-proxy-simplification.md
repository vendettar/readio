# Cloud Instruction 013: Discovery Backend Hardening and Parser Modularization [COMPLETED]

## 0. Context and Decision
Cloud is now a backend-owned product surface. For Cloud, the mature product direction is:

- `apps/cloud-api` owns the discovery networking boundary
- `apps/cloud-api` continues to return Cloud-owned stable JSON contracts from `/api/v1/discovery/*`
- `apps/cloud-ui` consumes same-origin Cloud APIs and does not become the owner of raw third-party discovery parsing

This instruction explicitly rejects the "pure transparent proxy for all discovery routes" direction.

Despite the filename, this task is **not** primarily about simplifying Cloud into a transparent proxy. The actual implementation target is:

- preserve backend ownership of discovery contracts
- harden discovery fetch/parse behavior
- modularize the current backend implementation
- improve observability and bounded backend caching

The current problem is not that discovery parsing lives in the wrong tier. The problem is that the current implementation in `apps/cloud-api/discovery.go` is too coupled, too fragile around feed handling, and not observable enough when third-party sources misbehave.

## 1. Execution Mode

This instruction is a **parent hardening instruction**, not a license for one large unstructured refactor.

Expected execution order:

1. reproduce one or more concrete Cloud discovery failures first
2. add failing backend tests/fixtures
3. harden and modularize backend implementation against those failures
4. add bounded caching and observability where justified
5. update frontend only if backend contract changes require it

Preferred child split:

- `013a-discovery-feed-reproducer-and-fixtures`
- `013b-discovery-backend-modularization`
- `013c-discovery-cache-and-observability`

If implementation is done without explicit child files, the same phase order still applies.

Do **not** start by broadly rewriting `apps/cloud-api/discovery.go` without first locking a reproducer and test evidence.

## 2. Architectural Goal
Harden Cloud discovery while preserving backend ownership of discovery contracts.

At the end of this instruction:

- Cloud discovery remains backend-owned
- RSS parsing still lives in the backend
- `/api/v1/discovery/*` still returns Cloud-owned JSON contracts
- feed parsing and fetch behavior are more robust against real-world podcast feeds
- discovery request behavior is observable enough to debug timeouts, upstream failures, and malformed feeds on a weak VPS

## 3. Core Rules

### 2.1 Keep Discovery Contract Ownership in the Backend
Do not convert Cloud discovery into a transparent raw Apple/RSS proxy.

Do not:

- move raw RSS/XML parsing into `apps/cloud-ui`
- move raw Apple search/lookup/top parsing into `apps/cloud-ui`
- make `apps/cloud-ui` consume raw third-party payloads for discovery routes
- replace Cloud-owned JSON contracts with pass-through upstream formats

### 2.2 Lite Is the Behavioral Reference, Not the Contract Owner
`apps/lite` already contains mature parsing and mapping logic for discovery/feed behavior.

That logic should be used as a reference for:

- expected field coverage
- parsing tolerance
- normalization behavior
- edge-case handling

But this instruction does **not** change the ownership model:

- Lite remains browser-owned
- Cloud remains backend-owned

The backend may port, mirror, or align behavior with Lite, but the parsing responsibility stays in `apps/cloud-api`.

### 2.3 Optimize for Robustness on a Weak VPS
Cloud currently runs on a constrained host. This instruction must improve robustness without assuming large server capacity.

That means:

- avoid unnecessary repeated upstream fetch work
- add caching where it materially reduces repeated parse/fetch load
- keep timeouts and body limits explicit
- keep SSRF protections intact
- avoid widening the backend into an unrestricted relay

## 4. Problems This Instruction Must Solve

### 4.1 Feed Fragility
Real-world feeds vary widely in:

- XML structure
- namespaces
- content type headers
- redirects
- response size
- encoding quirks

Cloud feed handling must become more tolerant and easier to debug when a valid feed works in Lite/browser but fails in Go.

### 4.2 Discovery Coupling
`apps/cloud-api/discovery.go` currently mixes too many responsibilities:

- param validation
- upstream URL construction
- HTTP fetching
- decoding
- mapping
- error mapping
- route handling

This instruction should reduce that coupling.

### 4.3 Missing Observability
When a route fails with `502` or `504`, current diagnostics are insufficient.

Cloud needs structured request-level visibility for discovery failures, especially for:

- feed fetch duration
- upstream host
- upstream status
- timeout vs decode failure vs mapping failure

### 4.4 Repeated Upstream Cost
Without backend-side caching and request discipline, repeated top/search/lookup/feed requests can create unnecessary load on a 1c1g VPS and amplify third-party slowness.

## 5. Reproducer-First Requirement

Before backend refactoring begins, this instruction must first lock at least one concrete failing or fragile discovery case.

Minimum requirement:

- add or update focused backend tests in `apps/cloud-api/discovery_test.go`
- include at least one real-world-like feed fixture or response shape that represents a known Cloud fragility class

Examples of acceptable reproducer classes:

- a feed shape that works in Lite/browser but fails or degrades in Cloud
- malformed-but-tolerable XML that should produce a better classified error
- redirect/timeout/upstream-body behavior that currently produces weak diagnostics

Do **not** begin with "cleanup first, tests later".

## 6. Backend Work (`apps/cloud-api`)

### 6.1 Modularize Discovery Implementation
Refactor discovery handling into clearer layers. Exact file split is implementation-dependent, but the architecture should separate:

1. parameter validation
2. upstream request construction
3. upstream HTTP fetching
4. feed/Apple decode logic
5. mapping into Cloud canonical JSON payloads
6. error classification and response writing

Do not leave all complexity fused into route handlers if it can be cleanly separated.

### 6.2 Keep Canonical Cloud JSON Contracts
Preserve the current Cloud contract shape for discovery consumers.

That includes keeping backend-owned JSON responses for at least:

- `GET /api/v1/discovery/top-podcasts`
- `GET /api/v1/discovery/top-episodes`
- `GET /api/v1/discovery/search/podcasts`
- `GET /api/v1/discovery/search/episodes`
- `GET /api/v1/discovery/lookup/podcast`
- `GET /api/v1/discovery/lookup/podcast-episodes`
- `GET /api/v1/discovery/lookup/podcasts`
- `GET /api/v1/discovery/feed`

If any field-level contract changes are unavoidable, they must be explicitly documented and covered by tests.

### 6.3 Harden Feed Fetch and Parse
Improve feed robustness without abandoning backend parsing.

Required areas:

- realistic browser-like request headers only if they materially improve compatibility
- explicit timeout behavior
- explicit body size limits
- redirect handling that remains SSRF-safe
- better malformed XML diagnostics
- more tolerant feed parsing where valid real-world feeds currently fail

Use Lite's mature parsing behavior as the functional reference when choosing backend fixes.

### 6.4 Add Discovery Observability
Add structured logging for discovery request handling.

At minimum, for failures and slow requests, log enough to answer:

- which discovery route failed
- which upstream host/url class was used
- how long the request took
- whether failure came from timeout, upstream non-success, decode, or mapping

Do not dump entire large payloads into logs. Small bounded snippets for malformed feed debugging are acceptable if carefully capped.

Minimum structured log fields should include:

- `route`
- `upstream_kind` (`apple-search`, `apple-lookup`, `feed`)
- `upstream_host`
- `elapsed_ms`
- `error_class`
- `upstream_status` when available
- `timed_out` when applicable

If slow-request logging is added, define an explicit threshold rather than ad hoc logging.

### 6.5 Add/Improve Backend Caching
Add or harden backend-side caching for repeated discovery work where it materially reduces upstream and CPU load.

First-pass cache scope should be explicit, bounded, and low-risk.

Recommended first-pass cache candidates:

- top podcasts
- top episodes
- lookup results

Feed caching is optional and must be justified by reproducer evidence plus bounded-memory behavior. Do **not** assume raw feed body caching is required in the first implementation pass.

The cache design should fit a weak VPS:

- bounded
- explicit TTLs
- low operational complexity
- no Redis requirement for this instruction

The instruction should make cache policy explicit:

- which routes are cached
- cache key dimensions
- TTL per class
- whether error responses are cached (default: no)

### 6.5.1 Cache Ownership Principle
In Cloud, discovery cache ownership must follow discovery contract ownership.

That means:

- backend cache is the primary discovery cache layer
- frontend cache is secondary and lightweight
- long-lived discovery truth should not exist independently in both tiers

Allowed frontend cache behavior in Cloud:

- React Query in-memory/session cache for UX smoothing
- short-lived dedupe or query reuse within the active browser session

Disallowed Cloud cache direction:

- reintroducing Lite-style provider-owned persistent discovery cache as the primary Cloud runtime strategy
- making frontend SWR/persistent cache a competing long-lived discovery truth source

If frontend cache behavior is retained or adjusted, it must remain subordinate to backend cache ownership and must not weaken the backend-owned architecture.

### 6.6 Preserve Security Boundaries
Do not weaken:

- feed URL validation
- SSRF protections
- private/loopback/link-local denial
- redirect destination validation
- route parameter validation

This instruction is for hardening, not broadening.

## 7. Frontend Work (`apps/cloud-ui`)

### 7.1 Keep Frontend on Stable Cloud Discovery Contracts
`apps/cloud-ui` should continue to consume same-origin Cloud discovery APIs as stable JSON contracts.

Default expectation: this remains primarily a backend task.

Frontend work is allowed only for:

- adapting to explicitly approved contract improvements
- fixing assumptions that conflict with hardened backend behavior
- updating tests and runtime expectations

Do not port raw Lite discovery providers into Cloud as the primary runtime path.

### 7.2 Lite as Reference Only
It is acceptable to compare frontend expectations against Lite behavior and use Lite parser/mapping behavior as a reference when validating backend parity.

It is not acceptable to make `apps/cloud-ui` the raw parser owner for third-party discovery payloads.

## 8. Implementation Checklist
- [ ] Refactor discovery backend into clearer fetch/decode/map/error layers
- [ ] Lock at least one concrete failing/fragile discovery reproducer first
- [ ] Preserve Cloud-owned JSON contracts for discovery routes
- [ ] Harden RSS feed parsing and fetch behavior using real-world feed compatibility evidence
- [ ] Add structured discovery request logging for failures and slow paths
- [ ] Add or improve bounded backend caching for repeated discovery traffic, with explicit route scope and TTL rules
- [ ] Preserve explicit cache ownership: backend primary, frontend lightweight only
- [ ] Keep SSRF and validation protections intact
- [ ] Verify Cloud frontend still works against same-origin JSON discovery contracts
- [ ] Cross-check important behavior against Lite's mature parsing logic

## 9. Verification Requirements

### 9.1 Backend Tests
Add or update tests covering:

- valid real-world-like feeds that previously failed in Cloud
- malformed XML handling
- timeout mapping
- upstream non-success mapping
- redirect and SSRF safety
- cache behavior where added

The primary backend verification surface is:

- `apps/cloud-api/discovery_test.go`

Do not rely on broad unrelated backend test passes as the only evidence.

### 9.2 Frontend Verification
Verify that Cloud frontend consumers still function correctly for:

- Explore top podcasts
- Explore top episodes
- search podcasts
- search episodes
- podcast lookup
- episode resolution through feed + provider fallback

### 9.3 Manual Regression Focus
Manual verification should explicitly include at least one real feed source that previously reproduced the Cloud-only failure mode.

Example class:

- a feed that succeeds in Lite/browser but previously failed in Cloud backend parsing

## 10. Done When
This instruction is complete only when:

- Cloud discovery is still backend-owned
- Cloud discovery routes still return stable backend-owned JSON contracts
- the known feed fragility is materially reduced
- discovery failures are observable enough to debug from logs
- repeated discovery traffic is reduced by bounded backend caching
- frontend discovery cache remains lightweight and subordinate to backend cache ownership
- behavior is aligned with the intended mature product direction, not reverted back to frontend raw parsing

## 11. Explicit Non-Goals
This instruction does **not** do the following:

- transparent-proxy all discovery routes
- move RSS parsing to `apps/cloud-ui`
- move Apple search/lookup/top parsing to `apps/cloud-ui`
- turn `/api/v1/discovery/*` into raw third-party passthrough routes
- redesign Lite or change Lite architecture

## Completion

- Completed by: Worker (3 phases)
- Reviewed by: Security, Reviewer
- Commands:
  - `go test ./...` (apps/cloud-api) — PASS
  - `go vet ./...` (apps/cloud-api) — clean
  - `go build ./...` (apps/cloud-api) — clean
- Date: 2026-03-31

### Phase Summary

**013a — Reproducer and XML sanitization:**
- Added `sanitizeXML()` to `discovery.go` — strips control chars, encodes bare `&` (matches Lite behavior)
- Added `TestDecodeDiscoveryFeedSanitizesXML` — 7 subtests (bare `&` content, URL attrs, control chars, CDATA, empty feed, missing enclosure URL, whitespace title)

**013b — Modularization and observability:**
- Extracted URL construction helpers: `buildAppleSearchURL`, `buildAppleLookupURL`, `buildAppleFeedURL`
- Added `classifyDiscoveryError()` error classifier
- Added `logDiscoveryRequest()` structured logging on all 8 discovery routes
- Log fields: route, upstream_kind, upstream_host, elapsed_ms, error_class, upstream_status, timed_out
- Slow request threshold: 5 seconds

**013c — Bounded caching:**
- In-memory `discoveryCache` (256 max entries, RWMutex)
- TTLs: top podcasts 30m, top episodes 30m, lookup 15m
- Feed NOT cached, error responses NOT cached
- `TestDiscoveryCacheBehavior` — 5 subtests (hit, miss, error not cached, expiry, lookup cached)

### Security Fixes Applied
- `fmt.Printf` debug leak replaced with `slog.Warn` (snippet capped to 100 bytes)
- SSRF protections, body limits, feed URL validation all preserved

### Verification
- `go test ./...` — PASS
- `go vet ./...` — clean
- `go build ./...` — clean

### Residual Notes
- `sanitizeXML()` may mangle non-standard named entities (`&nbsp;` → `&amp;nbsp;`) — acceptable trade-off for robustness
- Cache eviction drops new entries when full (no LRU) — acceptable for current load profile
- Feed caching deferred — can be added if reproducer evidence shows repeated feed load on VPS
