# Instruction 008a: Cloud ASR Provider Transport Audit

## Parent
- `008-cloud-asr-provider-relay-cutover.md`

## Objective
Produce the exact Cloud ASR transport inventory before any relay cutover happens.

This instruction does not implement the relay yet. It identifies:

- which ASR-adjacent requests are already backend-owned
- which ASR provider requests remain browser-direct
- which local-first behaviors must remain untouched
- which frontend/backend boundaries must be preserved during the cutover

## Goal
After this instruction:

- Cloud ASR request classes are explicitly enumerated
- provider submission is clearly separated from media fetch fallback
- later child instructions can cut over the provider transport without guessing

## Baseline Sources To Audit
Re-open the current Cloud implementation before writing the audit.

At minimum inspect:

- `apps/cloud-ui/src/lib/remoteTranscript.ts`
- `apps/cloud-ui/src/lib/asr/index.ts`
- `apps/cloud-ui/src/lib/asr/registry.ts`
- `apps/cloud-ui/src/lib/asr/providers/*.ts`
- `apps/cloud-ui/src/lib/player/remotePlayback.ts`
- `apps/cloud-ui/src/lib/fetchUtils.ts`
- `apps/cloud-api/main.go`

Use current Lite behavior only as a comparison point where needed. Do not assume Lite and Cloud are still identical in the ASR path.

## Required Audit Output
Create a short implementation-facing classification matrix covering at minimum:

1. remote audio fetch used as ASR input
2. remote transcript fetch used for transcript recovery
3. provider transcription submission
4. provider verification / readiness requests if still browser-direct in Cloud
5. local `blob:` / downloaded blob / Dexie-backed blob ASR input paths
6. tracking-URL-unwrapped audio paths involved in ASR ingestion
7. abort / stale-track-switch boundaries across the ASR flow

For each class, record:

- request initiator
- current Cloud ownership
- whether browser direct is still used
- whether `/api/proxy` is involved
- whether same-origin relay ownership is required
- failure classes that must remain terminal
- non-goals / reasons not to cut over

The audit must explicitly separate:

- media fetch fallback
- provider API submission

## Decision Rules
- provider API submission is a distinct networking class from media fetch fallback
- local blob/local download input preparation must remain browser-local
- result normalization boundaries must be identified before moving transport
- do not silently fold provider verification into transcription relay unless the audit proves it is necessary

## 8-Scope Scan
Include a short scan across:

- config
- persistence
- routing
- logging
- network
- storage
- UI state
- tests

Also include adjacent risk notes for:

- provider secret exposure
- large multipart upload size
- duplicate transcription submission
- stale completion after track switch
- client/server retry interaction

## Deliverable
Document the audit result in:

- `apps/docs/content/docs/apps/cloud/handoff/asr-relay-audit.md`

If that file has a Chinese counterpart in the same docs area, update it too.

## Tests
No new product behavior is implemented here, but identify the likely tests later instructions must update or add for:

- provider transport routing
- relay error mapping
- stale request handling
- local blob/downloaded blob input preservation

## Verification
1. Re-open the Cloud files listed in this instruction before writing the audit
2. `rg -n "transcribeAudioWithRetry|audio/transcriptions|verifyEndpoint|fetchWithFallback|/api/proxy" apps/cloud-ui/src apps/cloud-api`

## Done When
- every Cloud ASR-relevant request class is classified
- provider submission is clearly identified as browser-direct or backend-owned
- later child instructions can proceed without guessing transport ownership

