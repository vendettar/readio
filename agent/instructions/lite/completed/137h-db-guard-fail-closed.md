---
description: Make the DB architecture guard fail closed when the scan command fails
---

# Instruction 137h: DB Guard Fail-Closed [COMPLETED]

Goal: Ensure the DB architecture guard exits non-zero when its scan command fails unexpectedly.

## Scope
- `apps/lite/scripts/check-db-guard.js`
- Any direct test or smoke coverage for the script

## Read First (Required)
- `agent/instructions/lite/completed/057-prevent-direct-db-access-lint-rule.md`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Required Changes
1. Distinguish “no matches” from actual command failure.
2. Exit non-zero on missing `rg` or any unexpected scan error.
3. Add a focused failure-mode test or smoke coverage if a fitting script-test surface exists.

## Acceptance Criteria
- Guard returns success only for clean scans.
- Unexpected scan failures cannot silently pass CI.

## Verification Commands
- `pnpm -C apps/lite lint:db-guard`
- Any added script test command

## Decision Log
- Waived

## Bilingual Sync
- Not applicable

## Completion
- Completed by: Worker (Codex)
- Commands:
  - `pnpm -C apps/lite lint:db-guard`
  - `pnpm -C apps/lite test:run src/__tests__/dbGuard.script.test.ts`
- Date: 2026-03-18
- Reviewed by: Codex
