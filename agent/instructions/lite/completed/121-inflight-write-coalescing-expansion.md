# Task: 121 - In-flight Write Coalescing Expansion

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`

## Goal
Apply the existing “same-key in-flight write coalescing” rule to additional high-frequency write paths, starting with subscription import.

## Scope
- `apps/lite/src/store/exploreStore.ts`
- `apps/lite/src/store/__tests__/exploreStore.test.ts`
- `apps/lite/src/store/filesStore.ts`
- `apps/lite/src/store/historyStore.ts`
- `apps/lite/src/store/__tests__/filesStore.repository-boundary.test.ts`
- `apps/lite/src/store/__tests__/historyStore.repository-boundary.test.ts`

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: no schema/index changes; write behavior only.
- Routing: no route changes.
- Logging: keep existing error logging; no new user-facing copy.
- Network: no new endpoints; repository calls unchanged.
- Storage: no DB migration/backfill.
- UI state: store write coalescing only; no view contract changes.
- Tests: add repository-boundary and abort-race coverage for coalesced writes.

## Hidden Risk Sweep
- Async control flow:
  - Shared in-flight promise must not be canceled by one caller's `AbortSignal`.
  - Deduped calls must preserve deterministic state updates under concurrent writes.
- Hot-path performance:
  - Coalescing key computation must stay O(n) over small payloads (bulk subscribe feed set only).
  - No extra read amplification on write paths.
- State transition integrity:
  - Write failure must remain observable (no swallowed errors on shared writes).
  - Request-id stale protection remains effective after coalescing.

## Implemented in This Patch
1. `bulkSubscribe` now coalesces concurrent writes when the request set is equivalent.
2. Coalescing key is deterministic:
   - normalized feed URLs
   - sorted feed URL set
   - current `countryAtSave`
3. Duplicate feed URLs inside one bulk import payload are collapsed before repository write.
4. Added test coverage for concurrent equivalent bulk imports.

## Contract
- Same-tab, same-operation, same-resource-set bulk subscribe requests share one in-flight promise.
- User-visible behavior does not change.
- Existing request-id isolation remains intact for stale response protection.
- Coalesced shared tasks are signal-decoupled after entry: per-caller `AbortSignal` only short-circuits that caller path and does not cancel shared DB writes.
- Local store updates/toasts in shared write paths execute only while at least one caller remains active (not aborted).

## Non-Goals
- No change to read flows.
- No cross-tab dedupe.
- No persistence schema or API contract changes.

## Follow-up Completion
1. `filesStore` write actions now coalesce same-key concurrent calls:
   - `updateFolder` (id + update payload)
   - `updateFileTrack` (id + update payload)
   - `deleteFileTrack` (id)
   - `deleteFileSubtitle` (id)
2. `historyStore.deleteSession` now coalesces by `sessionId`.
3. Added boundary tests for both stores to verify dedupe behavior.
4. Added abort-race tests: “first caller aborted, second caller alive” keeps shared write semantics correct.

## Verification Commands
- `pnpm -C apps/lite test:run src/store/__tests__/exploreStore.test.ts`
- `pnpm -C apps/lite test:run src/store/__tests__/filesStore.repository-boundary.test.ts src/store/__tests__/historyStore.repository-boundary.test.ts`
- `pnpm -C apps/lite typecheck`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/store/exploreStore.ts`
  - `apps/lite/src/store/filesStore.ts`
  - `apps/lite/src/store/historyStore.ts`
  - corresponding store tests under `apps/lite/src/store/__tests__/`
- Regression risks:
  - accidental coalescing of non-equivalent writes due to weak dedupe keys.
  - shared promise lifecycle bugs causing stale in-flight entries not cleared.
  - error-path behavior divergence between first and coalesced callers.
- Required verification:
  - run all commands above.
  - ensure abort-race tests pass and error propagation semantics remain intact.

## Decision Log
- Required: Waived (store-level reliability refinement, no architecture/policy shift).

## Bilingual Sync
- Not applicable (instruction-only change, no EN/ZH docs content touched).
