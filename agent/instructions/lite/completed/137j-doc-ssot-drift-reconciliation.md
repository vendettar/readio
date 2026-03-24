---
description: Reconcile documented contracts and repo structure claims that drifted across bilingual docs and READMEs
---

# Instruction 137j: Doc SSOT Drift Reconciliation [COMPLETED]

Goal: Reconcile known documentation drift across bilingual handoff docs and repo-level structure docs.

## Scope
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `README.md`
- `apps/docs/README.md`
- `apps/docs/content/docs/general/monorepo-strategy.mdx`
- `apps/docs/content/docs/general/monorepo-strategy.zh.mdx`

## Read First (Required)
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Required Changes
1. Reconcile the `localTrackId`/downloaded-podcast contract so English and Chinese audio-engine docs say the same thing.
2. Update repo-level README and monorepo strategy claims so paths/status match the current repository reality.
3. Keep `handoff/index` as overview only; put detailed contract text in the correct sub-docs.

## Acceptance Criteria
- English and Chinese docs describe the same audio-engine identity contract.
- Repo/docs structure references match files that actually exist.

## Verification Commands
- `pnpm -C apps/docs lint`
- `pnpm -C apps/docs typecheck`

## Decision Log
- Required

## Bilingual Sync
- Required

## Completion
- Completed by: Worker (Codex)
- Commands:
  - `pnpm -C apps/docs lint`
  - `pnpm -C apps/docs typecheck`
- Date: 2026-03-18
- Reviewed by: Codex
