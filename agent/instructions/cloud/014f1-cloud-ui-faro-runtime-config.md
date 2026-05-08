# Instruction 014f1 — Cloud UI Faro Runtime Config Foundation [COMPLETED]

## Objective

Add browser-public runtime config fields for optional Grafana Faro without installing Faro SDKs or initializing telemetry. This creates the safe config foundation for 014f2.

## Decision Log

- **Required / Waived**: Waived. This follows the master Grafana Cloud decision.

## Bilingual Sync

- **Required / Not applicable**: Not applicable unless docs are touched.

## Prerequisite

014e must be completed and reviewed.

## Scope

Frontend config only:

- `apps/cloud-ui/src/lib/runtimeConfig.ts`
- `apps/cloud-ui/src/lib/runtimeConfig.schema.ts`
- `apps/cloud-ui/src/lib/runtimeConfig.defaults.ts`
- Existing runtime-config tests under `apps/cloud-ui/src/lib/__tests__/`

Backend browser env allowlist only:

- `apps/cloud-api/browser-env-allowlist.json`
- `apps/cloud-api/main.go`
- `apps/cloud-api/main_test.go`

Instruction lifecycle:

- `agent/instructions/cloud/014f1-cloud-ui-faro-runtime-config.md`

If more than 10 files are required, stop and report a smaller split.

## Required Config

Browser-public runtime config fields:

- `VITE_GRAFANA_FARO_URL`
- `VITE_GRAFANA_FARO_APP_NAME`
- `VITE_GRAFANA_FARO_ENV`
- `VITE_GRAFANA_FARO_SAMPLE_RATE`

Rules:

- These fields are public and optional.
- Missing URL means Faro remains disabled.
- Sample rate must parse to a bounded number from `0` to `1`; invalid values must disable Faro or fall back to a conservative disabled/default value.
- Do not add any Grafana API key, Loki credential, Prometheus credential, admin token, relay token, provider key, Basic Auth value, or server-owned credential to browser runtime config.

## Tests

Add/update focused tests for:

1. The four public Faro fields are accepted by runtime config parsing.
2. Missing Faro URL keeps config valid.
3. Invalid sample rate is safe and bounded.
4. Browser env allowlist includes only the four public Faro fields.
5. Browser env allowlist does not include Grafana write credentials, `READIO_ADMIN_TOKEN`, `READIO_METRICS_TOKEN`, relay secrets, provider keys, or Basic Auth values.

## Verification

- `pnpm -C apps/cloud-ui test -- --run`
- `cd apps/cloud-api && go test ./...`

## Completion

- **Completed by**: Worker
- **Commands**:
  - `pnpm -C apps/cloud-ui test -- --run` — failed in unrelated podcast/local-search tests; `src/lib/__tests__/runtimeConfig.schema-parity.test.ts` passed in the same run.
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/runtimeConfig.schema-parity.test.ts` — passed.
  - `cd apps/cloud-api && go test ./...` — passed.
- **Date**: 2026-05-07
- **Reviewed by**: Codex, 2026-05-07
