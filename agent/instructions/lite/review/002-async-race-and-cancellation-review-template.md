# Async Race and Cancellation Review Template

## Purpose
Review race conditions, cancellation propagation, and stale async result isolation.

## Trigger
Use after network/retry/queue/timer/request-id refactors.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Modules: `{{PATHS}}`
- Async surfaces: `network | retry | queue | timer | idb pipeline`

## Required Checks
1. Latest-request-wins isolation
2. AbortSignal propagation through nested calls
3. Abort during backoff maps to `aborted` semantics
4. Timer cleanup on unmount/state switch
5. Inflight map cleanup on success/fail/abort
6. Wipe/reset safety against queued stale writes
7. One-shot media/event ordering safety: if events (e.g. `loadedmetadata`) can fire before dependent state binding (e.g. `sessionId`), require a second-chance recovery path and explicit regression tests for both orders (`event-before-bind` and `bind-before-event`)

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

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
