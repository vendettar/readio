# 120 Phase E Review Report (Guardrails / Tests / Tooling)

## Decision
APPROVE

## File Coverage Inventory
| File | Classification | Status | Notes |
|---|---|---|---|
| apps/lite/scripts/check-route-country-guards.js | major | Reviewed | Forbidden pattern guard behavior reviewed. |
| apps/lite/scripts/check-legacy-podcast-route-ban.js | major | Reviewed | Legacy path ban contract reviewed. |
| apps/lite/scripts/check-db-guard.js | major | Reviewed | DB boundary guard reviewed. |
| apps/lite/scripts/enforce-selectors.sh | major | Reviewed | Atomic-selector policy guard reviewed. |
| apps/lite/src/__tests__/routeGuards.script.test.ts | major | Reviewed | Guard script regression tests reviewed. |
| apps/lite/src/routeComponents/podcast/__tests__/RouteGuardAllowlist.test.ts | minor | Reviewed | Allowlist policy test reviewed. |

Coverage summary: major reviewed 100%, minor reviewed 100%.

## Findings

### IMPORTANT
1. **E-20260213-001** (Risk: 3 x 3 = 9)
   - Title: Route-guard script test under-validates scanner semantics.
   - Location: `apps/lite/src/__tests__/routeGuards.script.test.ts:74`
   - Why it matters: `findRouteGuardViolations` behavior can regress while the test still passes because it currently only checks output shape, not detection semantics.
   - Repro:
     1. Keep exported names and object shape unchanged.
     2. Accidentally weaken scanning logic in `findRouteGuardViolations`.
     3. Existing test still passes if array objects remain `{ file, pattern }` strings.
   - Expected: Include sample-driven assertions proving forbidden inputs are detected and allowed paths are ignored by scanner behavior.
   - Actual: Third test only asserts type shape.
   - Hard evidence: `findRouteGuardViolations returns structured violations list` test body contains only `typeof` checks.

## Cross-Cutting Quality Gates
- Workaround/hack audit: No workaround script found; issue is test strength, not script intent.
- Redundancy/dead-code audit: No dead script detected in reviewed set.
- Best-practice compliance: Guardrails exist and execute; one test-level blind spot remains.
- Algorithm/complexity audit: File scans are O(total scanned bytes), acceptable for CI.
- Better-implementation check: Add fixture/sample behavior assertions around `findRouteGuardViolations` to harden regression detection.

## Open Questions / Assumptions
- Assumption: Guard scripts remain fast enough after adding fixture-driven assertions.

## Assignment Table
| Finding | Owner Instruction | Verification Command |
|---|---|---|
| E-20260213-001 | `119-legacy-country-resolver-decommission-and-guardrail-coverage.md` (backfill section) | `pnpm -C apps/lite test:run src/__tests__/routeGuards.script.test.ts` |

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
