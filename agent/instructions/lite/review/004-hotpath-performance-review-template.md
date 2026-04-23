# Hot-path Performance Review Template

## Purpose
Detect high-frequency render/data-path regressions and repeated-work patterns.

## Trigger
Use after list rendering, selector, parsing, caching, or playback/timeline changes.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Hot paths: `{{PATHS}}`
- Frequency assumptions: `{{TEXT}}`

## Required Checks
1. Selector granularity and rerender fan-out
2. Repeated heavy work inside render/effects
3. Full-table/materialization misuse
4. Cache/memo key completeness under dynamic context
5. Blob/object URL and media resource cleanup
6. Complexity note for critical loops (`O(...)`)
7. IndexedDB query/index discipline on hot paths (avoid `toArray()+filter` scans when indexed query is available)

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
- `pnpm -C apps/lite build`

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
