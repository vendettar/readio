# Instruction 014c — Cloud API Prometheus Metrics Endpoint [COMPLETED]

## Objective

Add a protected Prometheus-compatible `/metrics` endpoint to `apps/cloud-api` so Grafana Alloy can scrape backend process and future application metrics. This instruction only creates the metrics foundation and endpoint; it must not instrument discovery/proxy/ASR business paths yet.

## Decision Log

- **Required / Waived**: Required. Record the decision to use Grafana Cloud via Alloy scrape instead of direct app-side remote write.

## Bilingual Sync

- **Required / Not applicable**: Required for deployment/runtime docs touched by this instruction.

## Scope

Backend only:

- `apps/cloud-api/go.mod`
- `apps/cloud-api/go.sum`
- `apps/cloud-api/main.go`
- New focused metrics implementation file(s) under `apps/cloud-api/`
- New focused Go tests under `apps/cloud-api/`

Docs:

- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`

If more than 10 files are required, stop and report a smaller split.

## Preserve Existing Behavior

- Do not change `/ops`.
- Do not add `/ops` to main navigation.
- Do not change `/admin/logs`, `/admin/health`, or `/admin/metrics/summary`.
- Do not change admin ring-buffer behavior.
- Do not expose `READIO_ADMIN_TOKEN` or Grafana credentials through `/env.js`.
- Do not instrument business paths in this instruction.

## Required Design

1. Add `github.com/prometheus/client_golang/prometheus` and `github.com/prometheus/client_golang/prometheus/promhttp`.
   - Required dependency versions:
     - `github.com/prometheus/client_golang v1.23.2`
     - `github.com/golang/protobuf v1.5.4`
     - `github.com/matttproud/golang_protobuf_extensions v1.0.4`
     - `github.com/prometheus/client_model v0.6.2`
     - `github.com/prometheus/common v0.67.5`
2. Use an app-owned Prometheus registry, not the global default registry.
3. Register Go/process metrics only if they do not leak host paths, command-line secrets, or high-cardinality values.
4. Add `/metrics` before the SPA/static fallback.
5. Protect `/metrics` with `READIO_METRICS_TOKEN`:
   - Empty or unset token: `/metrics` returns `404`.
   - Missing or invalid `Authorization: Bearer <token>`: return `401`.
   - Valid token: return Prometheus exposition text.
6. All `/metrics` responses must include `Cache-Control: no-store` and `Pragma: no-cache`.
7. Do not add permissive CORS headers to `/metrics`.
8. `READIO_METRICS_TOKEN` is backend-only and must not appear in `browser-env-allowlist.json`.
9. Missing metrics token must not fail startup.

## Tests

Add focused Go tests for:

1. `/metrics` disabled when `READIO_METRICS_TOKEN` is empty -> `404`.
2. `/metrics` enabled but missing bearer token -> `401`.
3. `/metrics` enabled but invalid bearer token -> `401`.
4. `/metrics` valid bearer token -> `200` and Prometheus content type.
5. `/metrics` responses include `Cache-Control: no-store` and `Pragma: no-cache`.
6. `/metrics` is registered before static fallback.
7. `READIO_METRICS_TOKEN` is absent from `apps/cloud-api/browser-env-allowlist.json`.

## Verification

- `cd apps/cloud-api && go test ./...`
- `cd apps/cloud-api && go vet ./...`
- `cd apps/cloud-api && go build ./...`

## Documentation

- Add the `/metrics` runtime contract to `apps/docs/content/docs/apps/cloud/deployment.mdx` and `.zh.mdx`.
- Document `READIO_METRICS_TOKEN` as server-only.
- Document that nginx/Cloudflare should block public access and Alloy should scrape locally or through an internal path.
- Add a decision-log entry for Grafana Cloud via Alloy scrape.
- Do not update `technical-roadmap.mdx` until Reviewer approval.

## Completion

- **Completed by**: Worker
- **Commands**: `cd apps/cloud-api && go test ./...`; `cd apps/cloud-api && go vet ./...`; `cd apps/cloud-api && go build ./...`
- **Date**: 2026-05-07
- **Reviewed by**: Codex Reviewer — path-limited 014c review approved on 2026-05-07
