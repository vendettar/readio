# Instruction 003b: Cloud Feed Parsing Vertical Slice

Parent:

- `agent/instructions/cloud/003-cloud-architecture.md`

## Goal

Add the first backend-owned RSS feed fetch and parse capability for Cloud, so `apps/cloud-ui` can retrieve normalized feed data through same-origin APIs without browser XML fetches.

This slice is about feed ingestion only:

- backend: fetch and parse RSS/Atom feed into normalized JSON
- frontend: add only the minimum Cloud-owned surface needed to consume that JSON
- no direct browser XML parsing in `apps/cloud-ui`

## Changed Zone

Allowed areas:

- `apps/cloud/**`
- `apps/cloud-ui/**`
- minimal shared contract files only if strictly required
- minimal docs sync if the feed contract becomes durable

Out of scope:

- search expansion
- broad library or subscription flows
- `packages/ui/**`
- renaming `apps/cloud`
- updating `.github/workflows/cd-cloud.yml`

## Required Backend Work

Add a same-origin JSON endpoint in the current Go scaffold for:

1. `GET /api/v1/discovery/feed?url=...`

Requirements:

- backend performs the upstream fetch
- backend parses the feed and returns normalized JSON only
- no raw XML passthrough contract
- enforce SSRF protection
- enforce allowed scheme policy
- fail closed on unsafe redirects
- bounded timeout
- bounded body size
- backend-controlled error mapping
- return only fields the Cloud frontend needs now; do not overdesign the schema

## Required Frontend Work

In `apps/cloud-ui`:

- add a minimal local flow that can request one feed URL through the same-origin feed endpoint
- render:
  - input for a feed URL
  - submit action
  - loading / empty / error states
  - normalized feed identity and episode list
- no browser-side XML parsing
- no Lite feed/networking reuse
- no CORS proxy or browser-direct fallback

## Security Contract

This task is not complete unless the feed endpoint enforces:

1. SSRF guard
2. redirect fail-closed or explicit redirect policy
3. timeout
4. body size limit
5. backend-owned error mapping

If any one of these is missing, the task is incomplete.

## Required Tests

Backend tests:

1. valid feed fetch returns normalized JSON from mocked upstream XML
2. unsafe target is rejected before upstream fetch
3. oversized response is rejected
4. timeout maps to backend-controlled timeout error
5. invalid XML maps to backend-controlled parse error

Frontend tests:

1. feed flow calls only same-origin feed endpoint
2. loading / empty / error states render deterministically
3. normalized episodes render from backend JSON
4. no tests should mock browser XML parsing in `apps/cloud-ui`

## Verification

1. `go test ./...` in `apps/cloud`
2. `pnpm --filter @readio/cloud-ui build`
3. `pnpm --filter @readio/cloud-ui test`

## Done When

- Cloud feed data is retrieved through a same-origin backend endpoint only
- the endpoint enforces the required feed safety contract
- the frontend consumes normalized JSON, not XML
- no unrelated search / CD / shared-UI work is folded in

## Do Not Fold In

- search overhaul
- subscriptions or persistence
- shared UI extraction
- Cloud CD updates
- directory rename to `apps/cloud-api`
