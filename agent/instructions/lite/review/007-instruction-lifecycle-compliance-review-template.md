# Instruction Lifecycle Compliance Review Template

## Purpose
Verify instruction lifecycle correctness and docs/roadmap synchronization.

## Trigger
Use periodically (every 2-3 instructions) and before milestone closure.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Instruction Range: `{{IDS}}`

## Required Checks
1. Completion semantics (`[COMPLETED]` + `Completion.Reviewed by`)
2. Roadmap sync timing (only after review sign-off)
3. Single active instruction rule
4. Impact checklist presence in instructions
5. Decision Log / Bilingual fields correctness
6. Handoff index status consistency (EN/ZH)

## Findings
- Severity: `P0 | P1 | P2 | P3`
- Title:
- Evidence: `{{PATH:LINE}}`
- Impact:
- Fix Direction:
- Verification:

## Verification Commands
- `rg -n "\[COMPLETED\]|Reviewed by|## Completion" agent/instructions/lite`
- `rg -n "\[x\]|\[ \]" apps/docs/content/docs/general/technical-roadmap.mdx apps/docs/content/docs/general/technical-roadmap.zh.mdx`
- `rg -n "Completed|Pending|进行中|已完成" apps/docs/content/docs/apps/lite/handoff/index.mdx apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
