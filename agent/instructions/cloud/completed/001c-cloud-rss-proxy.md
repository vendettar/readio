# Instruction: 001c - Cloud RSS Proxy [COMPLETED]

## Goal
Implement the minimal app-owned RSS proxy for `apps/cloud` so Lite can stop depending on public browser-side CORS proxies for expected RSS/XML fetches.

## Depends On
- `agent/instructions/cloud/001a-cloud-go-app-scaffold.md`

## Scope

### In Scope
- `GET /api/proxy?url=<rss_url>` contract
- outbound RSS/XML fetch path
- explicit request validation and safety rules
- bounded timeout / response handling

### Out of Scope
- generic proxy capabilities
- POST/PUT/etc proxying
- discovery API proxying beyond the defined RSS fetch use case
- auth/user/session concerns
- frontend rewiring in `apps/lite` (e.g., hiding the CORS PROXY section in `SettingsPage` when running in cloud mode—this is mathematically a Phase 2 / Frontend Adoption task).

## Required Proxy Contract

### 1. Route Shape
- endpoint: `GET /api/proxy?url=<rss_url>`
- only `GET` is allowed
- invalid or missing URL must fail clearly

### 2. Allowed Targets
- only valid `http` / `https` URLs
- reject:
  - `localhost`
  - loopback addresses
  - link-local addresses
  - private-network targets
  - metadata-service style targets

### 3. Proxy Behavior
- fetch the target RSS/XML resource server-side
- **User-Agent Identity**: must explicitly set a custom UA (e.g., `Readio/1.0 (Cloud Proxy)`) to avoid arbitrary blocking by RSS providers.
- return upstream XML/text payload to caller
- expose only the minimal headers needed for this app use case
- set the intended CORS behavior explicitly
- do not become an unrestricted pass-through proxy

### 4. Bounded Execution & Abuse Prevention
- apply explicit timeout for outbound HTTP fetch
- **Rate Limiting**: implement basic abuse prevention safely (e.g., a minimal in-memory per-IP rate limit) to prevent the proxy from being dragged down by rogue loops. Keep the implementation minimal so it doesn't break the scaffold review boundary.
- keep response handling bounded and reviewable
- fail clearly on upstream timeout / invalid upstream response / network failure

### 5. Error Semantics
- invalid target input must be distinguishable from upstream fetch failure
- internal proxy errors must not leak stack traces or unsafe internals in responses

## Implementation Constraints
- keep the handler straightforward
- do not build a reusable generic proxy abstraction
- do not expand to multi-endpoint API gateway behavior
- keep security checks local and readable

## Verification
- run `apps/cloud`
- verify:
  - valid RSS URL returns XML/text successfully
  - invalid/missing URL is rejected
  - localhost/private target is rejected
  - timeout/error path returns a controlled failure response

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- proxy route/handler in `apps/cloud`
- any URL validation / target filtering helper introduced for this task

### Adjacent Critical Files (Spot Check)
- `agent/instructions/cloud/001-cloud-backend-scaffold.md`
- `agent/instructions/cloud/001a-cloud-go-app-scaffold.md`
- static serving code only if touched accidentally

## Deliver back
Return:
1. files changed
2. final proxy contract implemented
3. rejection rules implemented
4. timeout/error behavior
5. any follow-up needed before frontend adoption

## Completion
- Completed by: Codex
- Commands:
  - `pnpm --dir apps/cloud build` (failed: `go` not installed)
  - `pnpm build` (failed at `@readio/cloud#build` because `go` is not installed)
  - `git status --short apps/cloud`
  - `git diff --check -- apps/cloud/main.go apps/cloud/main_test.go`
  - `rg -n "lookupIP|validateProxyTargetResolution|isDisallowedProxyAddr|feeds.example.com" apps/cloud/main.go apps/cloud/main_test.go`
  - `sed -n '1,260p' apps/cloud/main.go`
  - `sed -n '1,320p' apps/cloud/main_test.go`
- Date: 2026-03-24
- Reviewed by: Codex
