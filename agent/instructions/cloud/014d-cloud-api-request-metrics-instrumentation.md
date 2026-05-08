# Instruction 014d — Cloud API Request Metrics Instrumentation [COMPLETED]

## Objective

Instrument selected `apps/cloud-api` request paths with low-cardinality Prometheus metrics exposed through the `/metrics` foundation from 014c.

## Decision Log

- **Required / Waived**: Waived. This follows the 014c Grafana Cloud via Alloy scrape decision.

## Bilingual Sync

- **Required / Not applicable**: Required for deployment/runtime docs touched by this instruction.

## Prerequisite

014c must be completed and reviewed.

## Scope

Backend only:

- Existing metrics implementation from 014c
- Request paths in `apps/cloud-api/discovery.go`, `apps/cloud-api/discovery_apple.go`, `apps/cloud-api/discovery_podcastindex.go`, `apps/cloud-api/asr_relay.go`, and `apps/cloud-api/main.go` only as needed
- Focused Go tests

Docs:

- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- Relevant Cloud handoff sub-doc if a runtime contract is added

If more than 10 files are required, stop and split.

## Preserve Existing Behavior

- Do not change response bodies, status codes, rate-limit behavior, proxy behavior, ASR relay behavior, discovery contracts, `/ops`, or `/admin/*`.
- Do not change existing canonical `slog` fields used by `/admin/metrics/summary`: `route`, `elapsed_ms`, `error_class`, `status`.
- Metrics are additive only.

## Required Metrics

Implement only these low-cardinality metrics:

1. `readio_cloud_http_request_duration_seconds`
   - Type: histogram
   - Labels: `route`, `status_class`, `error_class`
2. `readio_cloud_upstream_request_duration_seconds`
   - Type: histogram
   - Labels: `provider`, `route`, `status_class`, `error_class`, `cache_status`
3. `readio_cloud_upstream_errors_total`
   - Type: counter
   - Labels: `provider`, `route`, `error_class`
4. `readio_cloud_asr_relay_requests_total`
   - Type: counter
   - Labels: `provider`, `mode`, `status_class`, `error_class`

Allowed label values must be closed enums:

- `route`: existing stable route names such as `discovery/search/podcasts`, `discovery/lookup/podcast-episodes`, `asr-relay/transcriptions`, `proxy/media`.
- `provider`: `apple`, `podcastindex`, `groq`, `cloudflare`, `proxy`, `unknown`.
- `status_class`: `2xx`, `3xx`, `4xx`, `5xx`, `unknown`.
- `error_class`: existing coarse classes; unknown raw errors must map to `unknown`.
- `cache_status`: `hit`, `miss`, `stale`, `bypass`, `unknown`.
- `mode`: `direct`, `worker`, `builtin`, `unknown`.

## Forbidden Metrics Content

Do not use the following as metric labels or metric values:

- Full URL, path with IDs, query string, fragment
- Podcast title, episode title, GUID, iTunes ID
- Search query
- User IP or user identifier
- Raw error message
- SQL statement or SQLite path
- Header names/values
- Request/response body
- Audio URL, audio bytes, transcript text

## Tests

Add focused tests for:

1. Metrics output includes the required metric names after representative requests.
2. Status codes map to bounded `status_class`.
3. Unknown/raw errors map to bounded `error_class`.
4. Metric labels never include query strings, full URLs, search terms, GUID-like values, headers, or raw error messages in representative proxy/discovery/ASR cases.
5. Existing `/admin/metrics/summary` behavior remains intact.

## Verification

- `cd apps/cloud-api && go test ./...`
- `cd apps/cloud-api && go vet ./...`
- `cd apps/cloud-api && go build ./...`

## Documentation

- Document metric names and allowed labels in Cloud deployment docs.
- Update the zh counterpart.
- Do not update `technical-roadmap.mdx` until Reviewer approval.

## Completion

- **Completed by**: Worker
- **Commands**: `cd apps/cloud-api && go test ./...`; `cd apps/cloud-api && go vet ./...`; `cd apps/cloud-api && go build ./...`
- **Date**: 2026-05-07
- **Reviewed by**: Codex (GPT-5), 2026-05-07
