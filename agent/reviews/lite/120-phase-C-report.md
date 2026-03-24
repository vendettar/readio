# 120 Phase C Review Report (Stores + Async State Machines)

## Decision
APPROVE

## File Coverage Inventory
| File | Classification | Status | Notes |
|---|---|---|---|
| apps/lite/src/store/exploreStore.ts | major | Reviewed | Async domain isolation + write/read race checks reviewed. |
| apps/lite/src/store/playerStore.ts | major | Reviewed | Load lifecycle/state machine + request-id contract reviewed. |
| apps/lite/src/store/historyStore.ts | major | Reviewed | History transitions and persistence coupling reviewed. |
| apps/lite/src/store/filesStore.ts | major | Reviewed | File-side state transitions reviewed. |
| apps/lite/src/hooks/useAppInitialization.ts | major | Reviewed | Init-time async orchestration reviewed. |
| apps/lite/src/store/__tests__/exploreStore.test.ts | minor | Reviewed | Store race safety coverage reviewed. |
| apps/lite/src/store/__tests__/playerStore.test.ts | minor | Reviewed | Player load/update test coverage reviewed. |
| apps/lite/src/hooks/__tests__/useAppInitialization.test.ts | minor | Reviewed | Init flow evidence reviewed. |

Coverage summary: major reviewed 100%, minor reviewed 100%.

## Findings

### IMPORTANT
1. **C-20260213-001** (Risk: 4 x 2 = 8)
   - Title: `playerStore` uses `Date.now()` as cancellation token source in multiple load-reset paths.
   - Location: `apps/lite/src/store/playerStore.ts:237`, `apps/lite/src/store/playerStore.ts:373`, `apps/lite/src/store/playerStore.ts:408`
   - Why it matters: When two resets happen within the same millisecond, token equality can fail to invalidate stale async continuations.
   - Repro:
     1. Trigger two rapid track resets in the same tick (double navigation/programmatic replay).
     2. Observe async branches guarded by `loadRequestId` equality.
   - Expected: Strictly monotonic token increments per reset event.
   - Actual: Timestamp token may collide at millisecond granularity.
   - Hard evidence: above assignments write `Date.now()` directly.

## Cross-Cutting Quality Gates
- Workaround/hack audit: No patch-style workaround found in explore/files/history stores.
- Redundancy/dead-code audit: No dead async branch identified in major files.
- Best-practice compliance: Atomic selectors are respected; async isolation mostly aligned except finding C-20260213-001.
- Algorithm/complexity audit: Store operations are predominantly O(1)/O(n list ops) with expected list scale.
- Better-implementation check: Monotonic integer counter reuse is simpler/safer than timestamp tokens.

## Open Questions / Assumptions
- Assumption: Existing behavior has low repro probability but non-zero race exposure in fast interactions.

## Assignment Table
| Finding | Owner Instruction | Verification Command |
|---|---|---|
| C-20260213-001 | `118-async-cancellation-integrity-and-request-id-isolation.md` (backfill section) | `pnpm -C apps/lite test:run src/store/__tests__/playerStore.test.ts src/hooks/__tests__/useAppInitialization.test.ts` |

## Dedup Map
- None.

## Verification Evidence
Baseline command set executed on current HEAD:
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:db-guard`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite i18n:check`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
All PASS.
