# Boundary and Import Governance Review Template

## Purpose
Enforce architecture boundaries and prevent illegal cross-layer imports.

## Trigger
Use after repository/core/app boundary changes or dependency additions.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Boundary pairs: `apps/lite <-> packages/core <-> apps/docs`
- Modules: `{{PATHS}}`

## Required Checks
1. Business logic placement respects boundaries
2. No forbidden cross-package imports
3. Shared utilities have one canonical module
4. Dependency additions are authorized and justified
5. Legacy/old systems fully removed after replacement
6. Docs reflect real boundary ownership
7. Discriminator governance: no repeated raw branch literals where shared runtime constants should be used
8. `sourceType` discriminator branching uses shared guards/constants (`isUserUploadTrack`, `isPodcastDownloadTrack`, `TRACK_SOURCE`) rather than ad-hoc checks
9. No cross-domain repository shortcuts (upload/download domains must go through canonical repository APIs)

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
