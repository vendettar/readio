# Instruction 008d: Cloud ASR Relay Regression Coverage [COMPLETED]

## Parent
- `008-cloud-asr-provider-relay-cutover.md`
- `008b-cloud-asr-backend-relay-contract.md`
- `008c-cloud-asr-client-relay-cutover.md`

## Objective
Prove that the Cloud ASR relay cutover removes browser-direct provider CORS failures without breaking current ASR state behavior.

This instruction is test-focused. It should tighten both backend and frontend regression coverage around the ASR relay contract.

## Goal
After this instruction:

- same-origin relay ownership is explicitly tested
- provider error mapping is explicitly tested
- stale completion and abort behavior remain recoverable
- local blob/downloaded blob assumptions remain intact

## Required Coverage
At minimum add or strengthen tests for:

1. Cloud browser path uses same-origin relay instead of direct provider endpoint
2. relay success preserves the existing normalized transcription result contract
3. provider unauthorized maps correctly
4. provider rate-limited maps correctly
5. provider 5xx maps correctly
6. local blob/downloaded blob input still works after the relay cutover
7. stale completion / track switch does not let an old relay result override the current track

At least one case in items 1-2 must deterministically prove:

- same-origin route is called
- direct provider endpoint is not called

Do not rely solely on manual runtime observation.

## Topology And State Requirements
Tests must verify not just returned data, but state transition integrity:

- no permanent loading state after relay failure
- no stale transcript overwrite after track switch
- no silent fallback back to direct provider endpoint
- no regression in local-first ASR input handling

## Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted `vitest` coverage for ASR relay/state/error paths

## Done When
- relay ownership is proven by tests, not inferred
- provider error semantics are explicitly covered
- ASR state remains recoverable across success, error, and stale-request paths

## Completion
- Completed by: Codex
- Reviewed by: Codex
- Commands:
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui exec vitest run src/lib/asr/__tests__/backendRelay.test.ts src/lib/__tests__/remoteTranscript.asr.test.ts src/lib/__tests__/remoteTranscript.localInputRelay.test.ts`
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui exec vitest run src/lib/asr/__tests__/backendRelay.test.ts src/lib/__tests__/remoteTranscript.asr.test.ts src/lib/__tests__/remoteTranscript.localInputRelay.test.ts src/lib/asr/__tests__/index.deepgram-routing.test.ts src/lib/asr/__tests__/index.providerToggleGuard.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `go test ./...`
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui build`
  - `git diff --check`
- Date: 2026-03-29

## Completion
- Reviewed by: Codex
