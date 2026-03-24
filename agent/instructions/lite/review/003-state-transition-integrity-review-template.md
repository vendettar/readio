# State Transition Integrity Review Template

## Purpose
Verify event-driven state transitions are deterministic, recoverable, and action-safe.

## Trigger
Use after store/status enum/player mode/transcript flow updates.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Stores/hooks/components: `{{PATHS}}`
- State enums/machines: `{{LIST}}`

## Required Checks
1. No action-blocking dead states
2. Failure -> retry/new request reset correctness
3. Cross-mode continuity (docked/full/page transitions)
4. Stale error/message leakage prevention
5. Single authority for UI status decisions
6. Regression tests for rapid user actions
7. Cross-store atomicity: no observable inconsistent window for multi-store updates (e.g. player/transcript)

## Findings
- Severity: `P0 | P1 | P2 | P3`
- Title:
- Evidence: `{{PATH:LINE}}`
- Impact:
- Fix Direction:
- Verification:

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
