# Patch Diff Review Template

## Purpose
Fast high-signal review for staged/patch changes before merge.

## Trigger
Use on each implementation patch or PR-sized batch.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Diff Range: `{{git range / staged}}`
- Related Instruction(s): `{{LIST}}`

## Required Checks
1. Contract drift vs instruction/docs
2. Regression risk on touched flows
3. New dead code / partial migration leftovers
4. Inline style / lint / selector guard violations
5. Error handling semantics changed unintentionally
6. Added/removed dependency or API behavior change
7. New branch discriminators use SSOT constants/guards (no scattered magic strings)

## High-Risk Focus Areas (Optional)
- Playback + transcript switching
- Storage/write ordering and stale state
- Async cancel/retry interplay
- Route/query param correctness

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
- targeted `pnpm -C apps/lite test:run -- <paths>` for touched modules

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
