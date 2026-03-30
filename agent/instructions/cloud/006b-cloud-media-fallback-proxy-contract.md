# Instruction 006b: Cloud Media Fallback Proxy Contract [COMPLETED]

## Parent
- `006-cloud-media-fallback-default-proxy.md`
- `006a-cloud-media-surface-audit.md`

## Objective
Define and implement the backend contract that allows Cloud to act as a built-in fallback proxy for media-related requests that fail browser-direct.

This instruction is backend-only. It does not yet change frontend retry routing.

## Goal
After this instruction:

- `apps/cloud-api` exposes the backend surface required for Cloud media fallback
- the backend contract is pass-through and non-caching
- `Range`/partial-content semantics are explicitly supported where needed
- unsafe target classes remain blocked

## Baseline
Cloud already has a minimal proxy surface in:

- `apps/cloud-api/main.go`

That existing scaffold is not sufficient as the full media fallback contract unless it is proven to cover:

- redirect chains
- request method pass-through where required
- request header forwarding where required
- `Range` request forwarding
- `206 Partial Content` response handling
- relevant upstream response header pass-through

Do not assume the current `/api/proxy` behavior is already correct for media fallback.

This instruction must reuse the existing:

- `/api/proxy`

route as the Cloud media fallback proxy surface. Harden and extend that route as needed; do not add a new media-only proxy route in this phase.

## Backend Work
Add or harden the Cloud media fallback backend contract in `apps/cloud-api`.

The backend contract must:

- remain same-origin to `apps/cloud-ui`
- be usable as a retry target for media-adjacent browser fetches
- be pass-through only for this phase
- not write media payloads to disk
- not introduce server-side cache/state

### Required Behaviors
- bounded timeout
- strict target URL validation
- existing SSRF protections must remain in force
- redirect-aware upstream handling
- explicit `HEAD` handling where the audited request classes require it
- explicit `Range` request forwarding where the client path requires it
- correct propagation of `206`, `200`, `404`, `416`, and timeout/error conditions
- content-type/content-length/content-range/accept-ranges behavior preserved when available
- response streaming/pass-through semantics for large media responses where the current client path requires them

### Required Error Contract
The backend must distinguish:

- invalid target request
- blocked target
- upstream timeout
- upstream transport failure
- upstream returned non-success
- invalid proxy method/headers contract

Do not collapse every failure into a generic `502`.

## Design Constraints
- do not turn Cloud into a permanent mandatory media relay
- do not add media caching
- do not add background fetchers or queue workers
- do not add persistence
- do not bypass existing host/IP validation just to make more media URLs work

## Request Contract Requirements
The backend contract must be explicit about:

- which methods are accepted
- which request headers can be forwarded
- whether response streaming is supported
- whether redirects are followed or surfaced
- whether tracking-URL-unwrapped targets are expected from the client or handled by the server

If the client is already expected to unwrap tracking URLs first, preserve that contract unless `006a` proves the backend must own it.

At minimum, the contract write-up must state:

- whether `HEAD` is accepted
- whether `GET` is accepted
- whether `Range` is forwarded only from an allowlist of request headers
- which response headers are intentionally forwarded back to the browser

## Tests
Add backend tests for at minimum:

- valid target acceptance
- blocked private/loopback target rejection
- redirect chain handling
- `HEAD` request handling for approved media sizing paths
- `Range` request forwarding
- `206 Partial Content` pass-through
- timeout mapping
- unsupported method rejection

## Verification
1. `go test ./...` in `apps/cloud-api`
2. targeted backend tests for media proxy behavior
3. any new handler paths must be manually smoke-tested with `curl -i`

## Done When
- Cloud backend exposes a non-caching media fallback proxy contract suitable for the client retry paths identified in `006a`
- range/seek-related transport behavior is explicitly covered
- tests prove the backend contract instead of relying on manual hope

## Completion
- Completed by: Codex execution worker
- Reviewed by: Codex reviewer
- Commands: `gofmt -w apps/cloud-api/main.go apps/cloud-api/main_test.go`, `go test -run 'TestProxyRouteOwnershipAndContracts|TestProxyServiceMediaFallbackContract' -v`, `go test ./...` in `apps/cloud-api`, `curl -i` smoke check on `http://localhost:8082/api/proxy` for `HEAD`, `curl -i` smoke check on `http://localhost:8082/api/proxy` for `Range GET`
- Date: 2026-03-28
