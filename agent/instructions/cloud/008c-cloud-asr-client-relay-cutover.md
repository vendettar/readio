# Instruction 008c: Cloud ASR Client Relay Cutover [COMPLETED]

## Parent
- `008-cloud-asr-provider-relay-cutover.md`
- `008a-cloud-asr-provider-transport-audit.md`
- `008b-cloud-asr-backend-relay-contract.md`

## Objective
Switch Cloud UI provider submission from browser-direct ASR endpoints to the backend relay.

This instruction is frontend/runtime-only. It must use the audit from `008a` and the backend contract from `008b`.

## Goal
After this instruction:

- Cloud browser code no longer directly submits transcription requests to Groq / Deepgram / Qwen / Volcengine endpoints
- Cloud uses the backend relay for provider submission
- local blob/downloaded blob input preparation remains browser-local
- Lite behavior remains unchanged

## Frontend Work
In `apps/cloud-ui`, cut only the provider submission layer over to the same-origin relay.

Candidate areas likely to change include:

- `apps/cloud-ui/src/lib/asr/index.ts`
- `apps/cloud-ui/src/lib/asr/providers/*.ts`
- `apps/cloud-ui/src/lib/remoteTranscript.ts`

## Required Behavior
- Cloud-only path uses same-origin relay
- Lite path remains browser-direct
- existing blob preparation remains local/browser-owned
- existing cooldown / retry policy semantics remain aligned
- stale track switch / abort semantics remain valid
- successful result normalization remains unchanged to callers

## Required Trigger Discipline
Do not collapse all ASR logic into one backend round-trip.

At minimum preserve the distinction between:

- local blob/downloaded blob preparation
- remote audio fetch fallback
- transcript recovery fetch fallback
- provider transcription submission

## Forbidden Shortcuts
- do not route provider submission through `/api/proxy`
- do not change Lite provider transport
- do not move browser-local persistence into the backend
- do not add Cloud-only UI controls

## Tests
At minimum, add or update Cloud frontend tests proving:

1. Cloud provider submission goes to the same-origin relay
2. direct provider endpoints are not called in the Cloud path
3. successful transcription results still load into the existing ASR/transcript flow
4. local blob/downloaded blob inputs still work
5. abort/stale completion behavior remains correct

## Verification
1. `pnpm -C apps/cloud-ui build`
2. targeted `vitest` for Cloud ASR relay path behavior
3. targeted search proving the Cloud path no longer calls provider transcription endpoints directly

## Done When
- Cloud ASR provider submission is relay-owned
- Lite remains unchanged
- Cloud browser code no longer directly calls provider transcription endpoints in the cut-over path

## Completion
- Completed by: Codex
- Reviewed by: Codex
- Commands:
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui exec vitest run src/lib/asr/__tests__/backendRelay.test.ts src/lib/asr/__tests__/index.deepgram-routing.test.ts src/lib/asr/__tests__/index.providerToggleGuard.test.ts src/lib/__tests__/remoteTranscript.asr.test.ts`
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui exec vitest run src/lib/__tests__/remoteTranscript.asr.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts src/lib/asr/__tests__/backendRelay.test.ts src/lib/asr/__tests__/index.deepgram-routing.test.ts src/lib/asr/__tests__/index.providerToggleGuard.test.ts`
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui build`
- Date: 2026-03-29
