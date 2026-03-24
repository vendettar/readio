---
description: Bring shared package and high-value Lite guardrails into the normal verification path
---

# Instruction 137i: Repo Verification Pipeline Hardening [COMPLETED]

Goal: Ensure the default repository verification path covers shared package type/build obligations and Lite guard scripts that currently sit outside root green checks.

## Scope
- `package.json`
- `apps/lite/package.json`
- `packages/core/package.json`
- Related CI/workflow files only if directly required

## Read First (Required)
- `apps/docs/content/docs/general/technical-roadmap.mdx`
- `apps/docs/content/docs/general/technical-roadmap.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Required Changes
1. Make `@readio/core` participate in normal type/build enforcement with explicit scripts.
2. Tighten the default repo or Lite verification path so DB/routing/selector/i18n guardrails are not omitted from normal green runs.
3. Keep the change minimal and explain any CI/default-script tradeoff in docs if behavior changes for contributors.

## Acceptance Criteria
- Shared package type/build obligations are explicit, not implicit.
- Default verification catches the highest-value Lite architecture/script guardrails.

## Verification Commands
- `pnpm lint`
- `pnpm typecheck`
- Any changed CI or workspace verification command

## Decision Log
- Required

## Bilingual Sync
- Required if docs are touched

## Completion
- Completed by: Worker (Codex)
- Commands:
  - `pnpm lint`
  - `pnpm typecheck`
- Date: 2026-03-18
- Reviewed by: Codex
