# Instruction 005g: Cloud Feed Error Contract Cleanup [COMPLETED]

## Parent
- `005-cloud-networking-cutover.md`

## Objective
Fix the Cloud feed backend error contract so malformed XML feed failures return XML-accurate error semantics instead of JSON-specific wording.

## Goal
After this instruction:

- malformed feed XML failures from `apps/cloud-api` are classified and messaged accurately
- Cloud feed consumers no longer receive a misleading “not valid JSON” backend message for XML parse failures
- backend tests lock the contract

## Required Work
Audit the feed decode/error mapping path and correct the error classification/message for malformed XML responses.

At minimum:

- trace the `apps/cloud-api` feed decode path from `handleFeed(...)` through `decodeDiscoveryFeed(...)` and `writeDiscoveryMappedError(...)`
- introduce an XML-accurate backend error classification/message for malformed feed payloads
- keep timeout, oversize, invalid-url, and non-success upstream status mapping behavior coherent
- add or update tests covering malformed XML payloads and expected status/error body

## Scope Scan Requirements
Before editing, report risks across:

1. config/env assumptions
2. persistence/data integrity
3. routing/param validation
4. logging/error visibility
5. network/error mapping consistency
6. storage/serialization
7. UI state affected by feed failures
8. tests/mocks

Also perform the hidden-risk sweep for repeated feed fetch work and any action-blocking failure state.

## Impact Checklist
- Affected modules: `apps/cloud-api/discovery.go`, backend tests, any Cloud feed-facing caller/tests if response contract text is asserted
- Regression risks:
  - feed failures collapsing into the wrong error bucket
  - frontend assumptions about specific error codes/messages drifting
  - decode-path changes altering non-XML failure handling
- Required verification:
  - backend tests covering malformed XML and non-success upstream responses
  - frontend/build verification if any contract assertions exist

## Decision Log
- Waived

## Bilingual Sync
- Not applicable unless docs are changed in the same task

## Tests / Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted backend tests covering malformed XML error mapping

## Done When
- malformed XML feed responses no longer report JSON-specific backend messages
- feed error mapping remains coherent for timeout/status/oversize cases
- verification commands are green

## Completion
- Completed by: Codex execution worker
- Reviewed by: Codex reviewer
- Commands: `go test ./... -run TestDiscoveryServiceRejectsInvalidParamsAndMapsUpstreamErrors` in `apps/cloud-api`; `go test ./...` in `apps/cloud-api`; `pnpm -C apps/cloud-ui build`
- Date: 2026-03-27 18:29:26 CST
