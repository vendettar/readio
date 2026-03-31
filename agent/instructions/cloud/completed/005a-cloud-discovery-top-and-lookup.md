# Instruction 005a: Cloud Discovery Top And Lookup [COMPLETED]

## Parent
- `005-cloud-networking-cutover.md`

## Objective
Move the first Cloud discovery flows from browser-direct networking to same-origin backend-owned APIs.

This child instruction covers only:

- top podcasts
- top episodes
- podcast lookup/detail
- podcast episodes lookup

## Goal
After this instruction:

- `apps/cloud-api` owns upstream Apple requests for these flows
- `apps/cloud-ui` calls only same-origin endpoints for these flows
- frontend UI remains the same as Lite

## Backend Work
Add or harden same-origin endpoints in `apps/cloud-api` for:

- `GET /api/v1/discovery/top-podcasts`
- `GET /api/v1/discovery/top-episodes`
- `GET /api/v1/discovery/lookup/podcast?id=...&country=...`
- `GET /api/v1/discovery/lookup/podcast-episodes?id=...&country=...&limit=...`

Requirements:

- validate request params
- bounded timeout
- backend-owned error mapping
- JSON-only responses
- Cloud-shaped normalized payloads, not raw Apple responses

## Frontend Work
In `apps/cloud-ui`:

- replace browser-direct networking for the above flows
- keep route/page/UI behavior aligned with Lite
- do not fork page structure to make the cutover easier

## Tests
At minimum:

- backend tests for top lists and lookup endpoints
- frontend tests proving same-origin calls for these flows
- no direct Apple request mocks in Cloud tests for these flows after cutover

## Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted `apps/cloud-ui` tests for explore/detail flows

## Done When
- Cloud top lists and lookup/detail flows are backend-owned
- UI remains Lite-equivalent
- tests for the changed flows pass

## Completion
- Completed by: Euclid
- Reviewed by: Leibniz
- Commands:
  - `go test ./...`
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/discovery/__tests__/cloudCutover.sameOrigin.test.ts`
  - `pnpm -C apps/cloud-ui build`
- Date: 2026-03-27
