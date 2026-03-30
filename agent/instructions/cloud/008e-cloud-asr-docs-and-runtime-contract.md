# Instruction 008e: Cloud ASR Docs And Runtime Contract [COMPLETED]

## Parent
- `008-cloud-asr-provider-relay-cutover.md`
- `008a-cloud-asr-provider-transport-audit.md`
- `008b-cloud-asr-backend-relay-contract.md`
- `008c-cloud-asr-client-relay-cutover.md`
- `008d-cloud-asr-relay-regression-coverage.md`

## Objective
Synchronize Cloud documentation, handoff state, and runtime contract wording after the ASR provider relay is implemented.

## Goal
After this instruction:

- Cloud docs accurately describe ASR provider transport ownership
- handoff docs reflect the separation between media fallback and provider relay
- no docs still imply that Cloud ASR provider submission is browser-direct

## Documentation Requirements
Update task-relevant Cloud documentation and handoff to reflect:

- Cloud media fetch fallback and Cloud ASR provider relay are separate mechanisms
- remote audio/transcript fetch fallback may still use `/api/proxy`
- Cloud ASR provider submission is backend-owned through a dedicated same-origin relay
- browser-local blobs/downloaded blobs remain local inputs
- Cloud does not use `/api/proxy` as a generic provider POST tunnel

## Required Accuracy Notes
Documentation must not over-claim:

- do not say "all media goes through the backend"
- do not say "`/api/proxy` handles provider transcription"
- do not imply that Lite has the same relay ownership
- do not imply server-side persistence or background ASR jobs

## Likely Files
Update the task-relevant Cloud docs only, likely including:

- `apps/docs/content/docs/apps/cloud/**`
- `apps/docs/content/docs/general/technical-roadmap.mdx`
- `apps/docs/content/docs/general/technical-roadmap.zh.mdx`
- Cloud handoff entry and relevant sub-docs
- `apps/docs/content/docs/general/decision-log.mdx`

If a touched docs file has a `.zh.mdx` counterpart, update both.

## Roadmap / Lifecycle Rules
- only mark roadmap progress after review approval
- keep handoff index high-level; move detailed implementation notes into specific sub-docs
- if any parent or child instruction completion state changes, keep lifecycle markers consistent
- update decision log in the same task because this instruction establishes a durable transport decision

## Verification
1. Re-read each docs file immediately before editing
2. `pnpm -C apps/cloud-ui build`
3. `go test ./...` in `apps/cloud-api`
4. any roadmap/handoff sync required by the instruction lifecycle

## Done When
- Cloud docs and handoff accurately describe the ASR relay contract
- roadmap, decision log, and lifecycle state are synchronized
- no stale Cloud docs still describe browser-direct provider submission as the Cloud contract

## Completion
- Completed by: Codex
- Reviewed by: Codex
- Commands:
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui exec vitest run src/lib/asr/__tests__/backendRelay.test.ts src/lib/__tests__/remoteTranscript.asr.test.ts src/lib/__tests__/remoteTranscript.localInputRelay.test.ts`
  - `go test ./...`
  - `pnpm -C /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui build`
  - `git diff --check`
- Date: 2026-03-29
