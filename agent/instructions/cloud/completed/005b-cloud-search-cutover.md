# Instruction 005b: Cloud Search Cutover [COMPLETED]

## Parent
- `005-cloud-networking-cutover.md`

## Objective
Move Cloud search from browser-direct Apple networking to same-origin backend-owned APIs.

This child instruction covers:

- podcast search
- episode search
- keeping the rest of Lite-equivalent search UI intact

## Goal
After this instruction:

- `apps/cloud-api` owns Apple search requests
- `apps/cloud-ui` search pages and command/search surfaces use same-origin APIs
- Cloud search keeps the same frontend product behavior as Lite except for networking ownership

## Backend Work
Add or harden same-origin endpoints in `apps/cloud-api` for:

- `GET /api/v1/discovery/search/podcasts?term=...&country=...&limit=...`
- `GET /api/v1/discovery/search/episodes?term=...&country=...&limit=...`

Requirements:

- validate and normalize `term`, `country`, `limit`
- empty term must be a controlled validation error
- bounded timeout
- backend-owned error mapping
- normalized Cloud JSON responses

## Frontend Work
In `apps/cloud-ui`:

- cut over search networking to same-origin APIs
- preserve Lite-equivalent UI composition and local search surfaces that do not require backend ownership
- do not replace search UI with a simplified Cloud-specific version

## Tests
At minimum:

- backend tests for podcasts/episodes search endpoints
- frontend tests proving search uses same-origin backend calls
- tests covering loading/empty/error states after cutover

## Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted `apps/cloud-ui` search tests

## Done When
- Cloud search networking is backend-owned
- search UI remains Lite-equivalent
- tests for search cutover pass

## Completion
- Completed by: Euclid
- Reviewed by: Leibniz
- Commands:
  - `go test ./...`
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/discovery/__tests__/cloudSearchCutover.sameOrigin.test.ts src/hooks/__tests__/usePodcastSearch.test.tsx`
  - `pnpm -C apps/cloud-ui build`
- Date: 2026-03-27
