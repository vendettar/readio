# Test Gap and Regression Review Template

## Purpose
Audit whether changes are adequately covered by tests and whether critical regressions can slip through.

## Trigger
Use after any behavior change or when review finds repeated regressions.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Changed files: `{{PATHS}}`
- Related existing tests: `{{PATHS}}`

## Required Checks
1. New behavior has at least one deterministic test
2. Negative path/error path is covered
3. Race/ordering-sensitive paths are covered
4. Test location follows project rules (co-located or approved shared infra)
5. Assertions target real integration points (not only mocked internals)
6. Flaky/hanging risk (timers, unresolved promises, leaked handles)
7. Schema/storage refactors include at least one cascade-related negative-path regression

## Readio Mandatory Regression Anchors
- `src/lib/__tests__/downloadService.db.test.ts`
- `src/lib/repositories/__tests__/DownloadsRepository.test.ts`
- `src/lib/player/__tests__/remotePlayback.test.ts`
- `src/routeComponents/__tests__/DownloadsPage.regression.test.tsx`

## Gap Matrix
| Behavior | Risk | Existing Test | Missing Case | Required Test Type |
|---|---|---|---|---|
| `{{behavior}}` | `{{P0-P3}}` | `{{path}}` | `{{case}}` | `unit/integration` |

## Findings
- Severity: `P0 | P1 | P2 | P3`
- Title:
- Evidence: `{{PATH:LINE}}`
- Impact:
- Fix Direction:
- Verification:

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- additional targeted suite commands for gaps found

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
