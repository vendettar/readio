# Task: 116 (Patch) - Split Index [COMPLETED]

## Status
- Date: 2026-02-12
- This patch is split into 5 atomic files for execution and review.
- Execute strictly in order: `116a` -> `116b` -> `116c` -> `116d` -> `116e`.

## Split Files
1. `agent/instructions/lite/patch/116a-route-country-ssot-and-link-builders.md`
2. `agent/instructions/lite/patch/116b-country-source-cache-and-slug-contract.md`
3. `agent/instructions/lite/patch/116c-region-unavailable-guardrails-and-doc-sync.md`
4. `agent/instructions/lite/patch/116d-favorites-library-url-hygiene.md`
5. `agent/instructions/lite/patch/116e-global-entry-url-canonicalization-and-tail-cleanup.md`

## Why Split
- Reduce blast radius and rollback cost.
- Avoid mixed concerns (routing/data/cache/CI/docs in one pass).
- Make verification deterministic per scope.

## Global Constraints
- First-release policy: no migration/backfill compatibility layers.
- No silent country fallback in content routes.
- No inline string route assembly for podcast/show/episode links.

## Decision Log
- Required: Yes (record final architecture decisions when 116e completes).

## Bilingual Sync
- Required: Yes (for all touched docs with `.zh.mdx` counterpart).

## Completion
- Completed by: Codex (GPT-5)
- Date: 2026-02-12
- Reviewed by: Codex (GPT-5)
