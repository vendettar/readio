---
description: Add keyboard-accessible transcript interactions without regressing existing reading behavior
---

# Instruction 137e: Transcript Keyboard Accessibility Hardening [COMPLETED]

Goal: Ensure transcript cue navigation and word-level actions are operable from the keyboard with explicit focus and activation semantics.

## Scope
- `apps/lite/src/components/Transcript/SubtitleLine.tsx`
- `apps/lite/src/components/Transcript/Word.tsx`
- Nearby tests and accessibility docs as directly needed

## Read First (Required)
- `apps/docs/content/docs/general/accessibility.mdx`
- `apps/docs/content/docs/general/accessibility.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Scope Scan (Required Before Coding)
Check and report risks across:
1. Config & env parsing
2. Persistence & data integrity
3. Routing & param validation
4. Logging & error handling
5. Network & caching
6. Storage & serialization
7. UI state & hooks
8. Tests & mocks

Also perform a hidden-risk sweep for:
- focus traps or dead-end interaction states in transcript surfaces
- hot-path render regressions from per-word keyboard scaffolding

## Required Changes
1. Provide semantic keyboard activation paths for cue navigation and word-level interaction.
2. Preserve existing pointer behavior and transcript reading visual language.
3. Add targeted keyboard interaction tests.
4. Update the relevant accessibility/transcript docs if the interaction contract changes.

## Forbidden Dependencies / Required Patterns
- Forbidden: ad hoc `div onClick` interaction without keyboard semantics
- Required: explicit focus behavior, activation model, and test coverage
- Required: no redesign beyond what is needed for accessibility compliance

## Acceptance Criteria
- Keyboard users can trigger the same core transcript actions as pointer users.
- Focus treatment is visible and non-destructive.
- Existing pointer flows still work.

## Required Tests
- Keyboard activation test for cue jump
- Keyboard activation test for word-level action entry point

## Verification Commands
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite typecheck`

## Decision Log
- Waived

## Bilingual Sync
- Required

## Completion
- Completed by: Codex (UI Designer role)
- Commands:
  - `pnpm -C apps/lite test:run src/components/Transcript/__tests__/SubtitleLine.i18n-tokenization.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm -C apps/lite typecheck`
- Date: 2026-03-18
- Reviewed by: Codex
