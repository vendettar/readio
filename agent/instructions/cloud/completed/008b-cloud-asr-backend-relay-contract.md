# Instruction 008b: Cloud ASR Backend Relay Contract [COMPLETED]

## Parent
- `008-cloud-asr-provider-relay-cutover.md`
- `008a-cloud-asr-provider-transport-audit.md`

## Objective
Define and implement the backend contract that allows Cloud to relay ASR provider transcription submission through a same-origin backend route.

This instruction is backend-only. It does not yet switch Cloud UI call sites.

## Goal
After this instruction:

- `apps/cloud-api` exposes a narrow same-origin ASR relay route
- Cloud no longer depends on a browser-direct provider transcription transport
- provider submission is backend-relayed without turning Cloud into a generic outbound POST proxy
- browser-supplied provider credentials remain transient request inputs in this phase and are not persisted server-side

## Backend Work
Add a dedicated Cloud ASR relay route under the existing API namespace.

Requirements:

- route is same-origin to `apps/cloud-ui`
- route accepts only the fields needed for transcription submission
- provider id must come from an explicit allowlist
- model input must be validated
- request body size must be bounded
- browser-supplied provider credentials are allowed in this phase only as transient request data
- relay must not persist uploads to disk
- relay must not cache audio or provider responses
- relay must not persist or log browser-supplied provider credentials
- relay must not expose arbitrary upstream URL selection

## Required Behaviors
- multipart or equivalent upload handling suitable for provider transcription requests
- bounded timeout
- stable upstream error mapping
- explicit mapping for:
  - unauthorized
  - payload too large
  - rate limited
  - service unavailable
  - client error
- request cancellation propagation where practical
- structured logging without leaking secrets

## Design Constraints
- do not broaden `/api/proxy`
- do not add generic passthrough POST proxy behavior
- do not add queue workers
- do not add object storage or persistence
- do not embed frontend-only state assumptions into the backend handler

## Request/Response Contract Requirements
The contract must be explicit about:

- accepted providers
- accepted payload fields
- whether browser-supplied provider credentials are accepted in this phase
- maximum request size
- response shape returned to Cloud UI
- error shape returned to Cloud UI

If the backend normalizes provider responses, document that contract in the implementation-facing tests.

## Tests
Add backend tests for at minimum:

1. supported provider acceptance
2. unsupported provider rejection
3. oversized request rejection
4. provider unauthorized mapping
5. provider rate-limit mapping
6. provider 5xx mapping
7. successful transcription relay response

## Verification
1. `go test ./...` in `apps/cloud-api`
2. targeted backend tests for the ASR relay contract
3. any new handler paths must be manually smoke-tested with same-origin requests where practical

## Done When
- Cloud backend exposes a narrow ASR relay contract
- provider transcription submission is same-origin backend-relayed
- browser-supplied provider credentials are handled transiently and are not persisted/logged
- tests prove the contract instead of relying on browser behavior guesses

## Completion
- Completed by: Codex
- Reviewed by: Codex
- Commands:
  - `go test -run 'TestASRRelayRouteOwnershipAndContracts|TestASRRelayCredentialsStayTransient' -v` in `apps/cloud-api`
  - `go test ./...` in `apps/cloud-api`
  - `curl -i -X POST http://127.0.0.1:8082/api/v1/asr/transcriptions ...` against a local Cloud API smoke server
- Date: 2026-03-29
