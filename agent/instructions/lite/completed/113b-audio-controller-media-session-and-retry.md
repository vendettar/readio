# Task: 113b - Media Session and Autoplay Retry Refactor (Phase 2) [COMPLETED]

## Precondition (Must)
- `113-refactor-audio-controller.md` must be completed and review-signed.

## Objective
Refactor media-session and autoplay-retry logic into explicit modules after controller hook extraction, with strict behavior parity.

## Product Decision (Fixed)
1. Extract autoplay retry logic into `useAutoplayRetry`.
2. Keep media session behavior unchanged; only isolate wiring points.
3. Do not introduce new playback orchestration services in this phase.

## Implementation Steps (Execute in Order)
1. Add `apps/lite/src/hooks/useAutoplayRetry.ts` and migrate retry state handling.
2. Move media-error mapping to dedicated utility (`apps/lite/src/lib/audioErrors.ts`).
3. Keep `GlobalAudioController` as coordinator with explicit hook composition.

## Required Tests
- Add autoplay retry unit tests and media-session wiring parity tests.
- Keep all existing audio-controller tests green.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Decision Log
- Required: No (phase-2 follow-up).

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
