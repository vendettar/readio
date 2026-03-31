# Instruction 005c: Cloud Feed Cutover [COMPLETED]

## Parent
- `005-cloud-networking-cutover.md`

## Objective
Move Cloud feed fetching/parsing from browser-direct networking to backend-owned Go endpoints.

## Goal
After this instruction:

- `apps/cloud-api` fetches and parses feed content
- `apps/cloud-ui` calls same-origin feed endpoints only
- frontend feed pages remain Lite-equivalent in UI/behavior

## Backend Work
In `apps/cloud-api`, add or harden a feed endpoint such as:

- `GET /api/v1/discovery/feed?url=...`

Requirements:

- fetch feed server-side
- parse feed server-side
- bounded timeout
- redirect policy
- response size/body limit
- SSRF guard
- backend-owned error mapping
- normalized JSON payload shaped for Cloud frontend consumption

## Frontend Work
In `apps/cloud-ui`:

- replace browser-direct feed requests with same-origin endpoint calls
- preserve existing page/UI composition
- do not simplify the feed flow just to fit the new backend

## Tests
At minimum:

- backend tests for valid feed parsing
- backend tests for timeout/invalid URL/upstream failure handling
- frontend tests proving feed page uses same-origin backend path

## Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted `apps/cloud-ui` feed tests

## Done When
- Cloud feed networking and parsing are backend-owned
- feed UI remains Lite-equivalent
- tests for feed cutover pass

## Completion
- Completed by: Turing
- Reviewed by: Planck
- Commands:
  - `go test ./...`
  - `pnpm -C apps/cloud-ui exec vitest run src/routeComponents/podcast/__tests__/PodcastShowPage.cloudFeedCutover.test.tsx`
  - `pnpm -C apps/cloud-ui build`
- Date: 2026-03-27
