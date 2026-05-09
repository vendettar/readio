# 144: Unified Request ID Strategy (Standardization) [COMPLETED]

## Objective
Unify the generation and format of `request_id` across the backend and frontend to improve traceability and follow industry best practices.

## Context
Current `request_id` generation is inconsistent across `main.go`, `asr_relay.go`, and the frontend.

## Proposed Changes

### 1. Unify Backend Generation
- Extract a shared `generateRequestID()` helper in `apps/cloud-api/main.go` (or a more appropriate common file).
- Use `crypto/rand` to generate a 16-byte random hex string (32 characters).
- Update all backend API surfaces (`proxy`, `asr`, `discovery`) to use this unified helper.

### 2. Standardize Frontend Generation
- Update `apps/cloud-ui/src/lib/id.ts` to provide a dedicated `generateRequestId()` function that uses `crypto.randomUUID()`.
- Ensure all manually tagged requests use this unified helper.

## Affected Modules
- `apps/cloud-api/main.go`
- `apps/cloud-api/asr_relay.go`
- `apps/cloud-api/discovery.go`
- `apps/cloud-ui/src/lib/id.ts`

## Verification & Testing
- **Backend Tests**: Run `go test ./apps/cloud-api/...`.
- **Frontend Lint & Typecheck**: `pnpm --filter @readio/cloud-ui lint` and `pnpm --filter @readio/cloud-ui typecheck`.
- **Behavioral Assertion**:
  - Verify that API error responses now return a `request_id` in the new 32-character hex format.

## Completion Section
- **Completed by**: Gemini CLI
- **Commands**: `cd apps/cloud-api && go test ./...`, `pnpm --filter @readio/cloud-ui lint && pnpm --filter @readio/cloud-ui typecheck`
- **Date**: 2026-05-09
- **Reviewed by**: Codex
