# Storage and Retention Review Template

## Purpose
Review persistence safety, capacity guardrails, cleanup integrity, and retention semantics.

## Trigger
Use after DB schema, retention policy, wipe, import/export, or storage quota logic changes.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Persistence modules: `{{PATHS}}`
- Tables/entities: `{{LIST}}`

## Required Checks
1. Capacity guardrails and predictable block behavior
2. Retention semantics (`write-on-success`, stale-safe, exceptions explicit)
3. Cleanup/wipe cannot be undone by stale async writes
4. Reference integrity (subtitle/blob/session orphans)
5. Fail-closed persistence for invalid payloads
6. Import/export contract consistency
7. Unified `tracks` invariants:
   - `sourceType`-scoped lookup correctness
   - cascade delete completeness (`tracks`, `local_subtitles`, `subtitles`, `audioBlobs`, `playback_sessions.localTrackId` unlink)

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
