# Instruction 127a: Transcriber Transport Policy Extraction [COMPLETED]

## Status
- [x] Active
- [x] Completed

## Goal
Extract retry and backoff classification logic from `transcribeAudioWithRetry` into a reusable transport utility to improve maintainability and testability of network resilience.

## Scope
- `apps/lite/src/lib/networking/transportPolicy.ts` (New)
- `apps/lite/src/lib/asr/index.ts` (Refactor)
- `apps/lite/src/lib/networking/__tests__/transportPolicy.test.ts` (New)

## Requirements
1. Create a generic `executeWithRetry` utility in `transportPolicy.ts`.
2. Support classification of failures:
   - `429` (Rate Limited): Respect `Retry-After` (or `retryAfterMs`).
   - `5xx` (Server Error): Backoff with jitter.
3. Allow feature-specific constraints (e.g., ASR-specific chunk duration limits for 5xx retries).
4. Standardize the `Fail-Fast` boundary (e.g., if `Retry-After` is too long, abort early).
5. Ensure `AbortSignal` is strictly respected in sleep loops and request execution.

## Verification
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run src/lib/networking/__tests__/transportPolicy.test.ts`
- `pnpm -C apps/lite test:run src/lib/__tests__/remoteTranscript.asr.test.ts`
- `pnpm -C apps/lite build`

## Completion
- Completed by: Antigravity
- Commands: pnpm -C apps/lite format && pnpm -C apps/lite lint && pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit && pnpm -C apps/lite test:run src/lib/networking/__tests__/transportPolicy.test.ts src/lib/__tests__/remoteTranscript.asr.test.ts && pnpm -C apps/lite build
- Date: 2026-02-27
- Reviewed by: Antigravity (Agent)
