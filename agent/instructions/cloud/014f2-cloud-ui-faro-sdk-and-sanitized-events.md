# Instruction 014f2 — Cloud UI Faro SDK and Sanitized Events [COMPLETED]

## Objective

Add optional Grafana Faro browser observability to `apps/cloud-ui` using the runtime config foundation from 014f1. Faro must be disabled by default, fail open, and emit only sanitized diagnostics.

## Decision Log

- **Required / Waived**: Waived. This follows the master Grafana Cloud decision.

## Bilingual Sync

- **Required / Not applicable**: Required for deployment docs touched by this instruction.

## Prerequisite

014f1 must be completed and reviewed.

## Scope

Frontend only:

- `apps/cloud-ui/package.json`
- Lockfile if dependency installation changes it
- `apps/cloud-ui/src/lib/faro.ts`
- `apps/cloud-ui/src/lib/__tests__/faro.test.ts`
- Top-level app/root initialization file only as needed

Docs:

- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/environment.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/environment.zh.mdx`

Instruction lifecycle:

- `agent/instructions/cloud/014f2-cloud-ui-faro-sdk-and-sanitized-events.md`

If more than 10 files are required, stop and report a smaller split.

## Required Privacy Contract

Allowed schema diagnostic fields:

- schema name
- provider enum
- route class
- issue path
- Zod issue code
- coarse error class

Forbidden:

- raw Zod input
- raw upstream payload
- full URL, query string, fragment
- request/response body
- headers
- admin token
- relay token
- provider API key
- cookies
- local file path
- transcript text
- episode description
- user search text
- audio URL

## Required Implementation

1. Install `@grafana/faro-web-sdk` and `@grafana/faro-react` only if needed for the chosen integration.
2. Create an isolated Faro module with:
   - `initializeFaro(config)`
   - `reportSchemaValidationError(input)`
   - sanitizer helpers
3. Initialize Faro once from the top-level app/root path after runtime config is available.
4. Use sampling before emitting optional diagnostics.
5. Never read `/ops` session state, `sessionStorage` admin token, IndexedDB, settings, provider credentials, or local media/transcript content.
6. Do not add in-app explanatory text or navigation.
7. Initialization errors must not block app boot.

## Tests

Add focused tests for:

1. Faro does not initialize when `VITE_GRAFANA_FARO_URL` is missing.
2. Invalid sample rate is bounded and safe.
3. Initialization exceptions are swallowed with dev-visible warning only and app boot continues.
4. Sanitizer redacts email, local path, Bearer token, `sk-*` token, signed URL query, cookies, and long transcript-like text.
5. Zod diagnostic reporting sends only allowed fields, not raw payload.
6. Faro code does not read `/ops` token, `sessionStorage`, IndexedDB, provider credentials, or local media/transcript content.

## Verification

- `pnpm -C apps/cloud-ui test -- --run`
- `pnpm -C apps/cloud-ui build`

## Documentation

- Document browser-public Faro config in deployment docs and zh counterpart.
- Document Faro privacy and disable/rollback behavior in Cloud handoff environment docs and zh counterpart.
- Explicitly document that Faro collector config is public and no Grafana write credential is browser-visible.

## Completion

- **Completed by**: Codex
- **Commands**:
  - `pnpm -C apps/cloud-ui add @grafana/faro-web-sdk`
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/faro.test.ts`
  - `pnpm -C apps/cloud-ui build`
  - `pnpm -C apps/cloud-ui test -- --run` — failed on existing podcast/search/session identity tests outside 014f2 scope.
- **Date**: 2026-05-07
- **Reviewed by**: Codex Reviewer, 2026-05-07
