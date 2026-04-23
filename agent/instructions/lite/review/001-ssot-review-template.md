# SSOT Review Template

## Purpose
Review single-source-of-truth integrity for one domain (settings, playback, subtitles, downloads, history, etc.).

## Trigger
Use when defaults/normalizers/cache authority/write paths are changed.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Domain: `{{DOMAIN}}`
- Related Instruction(s): `{{LIST}}`

## Canonical Contract (Required)
- Domain: `{{NAME}}`
- Canonical authority: `{{FILE/TABLE/API}}`
- Allowed writers: `{{LIST}}`
- Allowed readers: `{{LIST}}`
- Forbidden authorities: `{{LIST}}`

## Required Checks
1. Authority uniqueness (no split authority)
2. Write-path convergence (no bypass writes)
3. Read-path convergence (no stale legacy reads)
4. Fallback/default normalization consistency
5. Discriminator constant governance (no scattered raw literals for domain branch keys)
6. Async stale overwrite risk
7. Dynamic context update correctness

## Findings
- Severity: `P0 | P1 | P2 | P3`
- Title:
- Evidence: `{{PATH:LINE}}`
- Violation type: `authority_split | write_bypass | read_bypass | normalization_drift | discriminator_drift | race | other`
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
