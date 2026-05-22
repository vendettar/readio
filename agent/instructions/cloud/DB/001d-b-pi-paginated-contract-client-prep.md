# Instruction 001d-b: PI Paginated Contract Client Prep [COMPLETED]

Execute after `001d-a` unless Leadership explicitly approves parallel drafting.

This is a Phase 4 preparatory task. It may prepare frontend schemas, fixtures, tests, or docs drafts, but it must not claim the public endpoint contract is live.

## 1. Goal

Prepare the frontend and documentation surface for the upcoming paginated SQLite-backed episode-list contract without leaving runtime consumers half-migrated against an inactive backend route.

## 2. Scope

- frontend schema/type preparation where safe
- test fixtures for the paginated contract
- docs draft language for the bounded SQLite snapshot contract
- no live route-consumer cutover unless paired with `001d-c`

## 3. Depends On

- `001d-a-pi-route-read-path-sqlite-foundation.md`

## 4. Must

- Represent the required paginated response semantics:
  - `episodes`
  - `limit`
  - `offset`
  - `nextOffset`
  - `hasMore`
  - `storedTotal`
  - `isTruncated`
- Include optional snapshot metadata where prepared:
  - `lastSuccessfulFetchAt`
  - `nextRefreshAfter`
- Keep docs clear that the stored snapshot is the bounded local product window, not a full historical archive.
- Keep frontend runtime consumers compatible with the currently active backend until `001d-c` lands.
- If a schema is introduced before route activation, tests must make the inactive/prep status explicit.

## 5. Do Not

- Do not switch live frontend route consumers to require the paginated backend response before `001d-c`.
- Do not document the paginated contract as active production behavior before `001d-c`.
- Do not preserve a legacy full-list compatibility layer as the target contract.
- Do not mark Phase 4 or Instruction `001d` complete from this subtask.

## 6. Verification

- Run the relevant frontend schema/unit tests changed by this subtask.
- If backend files are not touched, backend Go tests are not required for this subtask.

## 7. Completion Requirement

When complete, append a `## Completion` section with:

- `Completed by`
- `Reviewed by`
- `Commands`
- `Date`
- `Integration Status: Not complete; public paginated contract not active until 001d-c.`

## Completion

- Completed by: Worker
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/discovery/__tests__/schema.test.ts`
  - `pnpm -C apps/cloud-ui exec tsc --noEmit`
- Date: 2026-05-18
- Integration Status: Not complete; public paginated contract not active until 001d-c.
