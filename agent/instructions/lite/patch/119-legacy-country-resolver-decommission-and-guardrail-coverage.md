# Task: 119 (Patch) - Legacy Country Resolver Decommission + Guardrail Coverage [COMPLETED]

## Goal
Complete replacement cleanup after country-in-path architecture migration by removing dead legacy resolver logic and strengthening regression guardrails.

## Context
Second-stage review found `apps/lite/src/lib/discovery/libraryCountryResolver.ts` is no longer used by production code (tests only). Keeping unused resolver logic after route-country SSOT migration increases cognitive load and creates future drift risk.

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: no schema changes.
- Routing: no route shape changes.
- Logging: no new logging requirements.
- Network: no endpoint changes.
- Storage: no storage changes.
- UI state: unaffected.
- Tests: update/remove obsolete tests and add guardrails to block reintroduction.

## Hidden Risk Sweep
- Async control flow: not applicable.
- Hot-path performance: minor bundle/cognitive reduction only.
- State transition integrity: unaffected.
- Dynamic context consistency: reduce accidental fallback paths by removing stale resolver API.

## Required Patterns
- Negative verification policy: when a system is replaced, remove deprecated path entirely.
- Route-country SSOT remains the only country-resolution authority for content pages.
- Guardrails enforce no reintroduction of library-country inference path for content correctness.

## Forbidden Dependencies
- No continued production references to `libraryCountryResolver`.
- No reintroduction of country inference fallbacks that bypass `/$country` authority.

## Implementation Steps
1. Decommission legacy resolver module
   - Remove:
     - `apps/lite/src/lib/discovery/libraryCountryResolver.ts`
   - Remove or adapt tests tied only to removed API:
     - `apps/lite/src/lib/discovery/__tests__/libraryCountryResolver.test.ts`
   - Ensure no production import remains.

2. Guardrail expansion
   - Extend static checks to fail if legacy resolver patterns are reintroduced in production source:
     - e.g., references to removed resolver symbols or fallback country inference hooks.
   - Keep explicit allowlist for test fixtures/generated files.

3. Docs/handoff sync (EN + ZH)
   - Update architecture/routing docs to state that legacy library-country resolver path is fully decommissioned:
     - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
     - `apps/docs/content/docs/apps/lite/routing.mdx`
     - `apps/docs/content/docs/apps/lite/routing.zh.mdx`
   - If handoff index mentions legacy resolver behavior, remove it.

## Acceptance Criteria
- No production code imports or references `libraryCountryResolver`.
- Tests and static guardrails reflect decommissioned status.
- Docs (EN + ZH) explicitly align with route-country SSOT and removal of legacy resolver path.

## Required Tests
- Static grep or guard-script assertions for removed symbols.
- Existing route-country and legacy-route guard scripts still pass.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/discovery/libraryCountryResolver.ts` (remove)
  - `apps/lite/src/lib/discovery/__tests__/libraryCountryResolver.test.ts` (remove/update)
  - guard script(s) and related tests
  - routing/architecture docs (EN + ZH)
- Regression risks:
  - hidden dependency missed in test-only or utility paths.
  - stale docs still describing removed behavior.

## Decision Log
- Required: Waived (cleanup under existing route-country SSOT decisions).

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:route-guards`
  - `pnpm -C apps/lite lint:legacy-route-ban`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-13

## Backfill Queue (From Instruction 120 Full Review)

- Source finding: `E-20260213-001` (`agent/reviews/lite/120-phase-E-report.md`)
- Gap:
  - `apps/lite/src/__tests__/routeGuards.script.test.ts` currently validates `findRouteGuardViolations()` output shape only, not detection semantics.
- Required follow-up:
  1. Add behavior assertions using controlled sample input/fixture files to prove forbidden patterns are detected.
  2. Add behavior assertions proving allowlisted paths are ignored.
  3. Keep current regex-level unit assertions as fast pre-checks.
- Verification:
  - `pnpm -C apps/lite test:run src/__tests__/routeGuards.script.test.ts`
