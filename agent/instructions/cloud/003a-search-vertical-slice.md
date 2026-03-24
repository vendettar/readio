# Instruction 003a: Cloud Search Vertical Slice

Parent:

- `agent/instructions/cloud/003-cloud-architecture.md`

## Goal

Extend the Cloud-only discovery path so `apps/cloud-ui` can search podcasts and episodes through same-origin backend APIs owned by the current Go scaffold.

This slice must stay narrow:

- backend: add search endpoints
- frontend: add a minimal app-owned search flow
- no browser-direct Apple calls in `apps/cloud-ui`

## Changed Zone

Allowed areas:

- `apps/cloud/**`
- `apps/cloud-ui/**`
- minimal shared contract files only if strictly required
- minimal docs sync only if the endpoint contract becomes durable

Out of scope:

- generic feed parsing endpoint
- `packages/ui/**`
- renaming `apps/cloud`
- updating `.github/workflows/cd-cloud.yml`
- copying `apps/lite` route tree into `apps/cloud-ui`
- adding browser-direct fallback or CORS proxy behavior to `apps/cloud-ui`

## Required Backend Work

Add same-origin JSON endpoints in the current Go scaffold for:

1. `GET /api/v1/discovery/search/podcasts?term=...&country=us&limit=20`
2. `GET /api/v1/discovery/search/episodes?term=...&country=us&limit=20`

Requirements:

- backend owns all upstream calls to Apple search endpoints
- frontend must not directly fetch Apple endpoints
- validate and normalize `term`, `country`, and `limit`
- bounded timeout
- JSON-only response
- backend-controlled error mapping
- return data shaped for Cloud frontend consumption, not raw Apple payloads
- empty search term must be rejected with backend-controlled validation, not silently treated as top charts

## Required Frontend Work

In `apps/cloud-ui`:

- add a minimal app-owned search surface on the homepage
- search can be local-state driven; do not pull in the full Lite router
- render:
  - search input
  - submit action
  - podcast results
  - episode results
  - loading / empty / error states
- same-origin podcast search results may enter the existing local podcast detail flow
- no `if (isCloud)` logic
- no Lite networking reuse
- no browser-direct fallback

## UI Constraints

- keep the implementation Cloud-owned
- local components are acceptable
- do not start `packages/ui` extraction in this task
- do not recreate Lite's full search architecture
- make the search flow simple but structurally correct

## Required Tests

Backend tests:

1. search podcasts returns normalized JSON from mocked upstream
2. search episodes returns normalized JSON from mocked upstream
3. invalid `term` / invalid `country` / invalid `limit` handling
4. upstream failure maps to backend-controlled error

Frontend tests:

1. search flow calls only same-origin search endpoints
2. loading / empty / error states render deterministically
3. podcast search results can enter the existing podcast detail flow if wired
4. no tests should mock direct Apple fetch in `apps/cloud-ui`

## Verification

1. `go test ./...` in `apps/cloud`
2. `pnpm --filter @readio/cloud-ui build`
3. `pnpm --filter @readio/cloud-ui test`

## Done When

- `apps/cloud-ui` can search podcasts and episodes using same-origin backend endpoints only
- no direct Apple requests come from `apps/cloud-ui`
- backend endpoints are covered by tests
- frontend search states are covered by tests
- no unrelated feed / CD / shared-UI work is folded in

## Do Not Fold In

- feed parsing vertical slice
- shared UI extraction
- Cloud CD updates
- directory rename to `apps/cloud-api`
