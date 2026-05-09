# Instruction 00C — Cloud API Grafana Loki Log Shipping Without Agent [COMPLETED]

## Objective

Send `apps/cloud-api` application logs to Grafana Cloud Logs/Loki without Grafana Alloy, Promtail, Docker log drivers, or any host-side observability agent.

This umbrella instruction is split into three bounded implementation phases:

- `00C1`: Go Loki client, `slog` fanout, queueing, shutdown flush, and backend tests.
- `00C2`: deployment environment plumbing and documentation.
- `00C3`: Grafana Explore/dashboard/alert guidance plus live verification checklist.

Workers must complete 00C1, then 00C2, then 00C3 in order. Do not stop after only one phase unless a blocker prevents all remaining independent work.

## Decision Log

- **Required / Waived**: Required if operators need to query Readio application logs in Grafana Cloud.
- **Provider**: Grafana Cloud Logs/Loki.
- **Agent policy**: Do not introduce Grafana Alloy or any host log agent.
- **Scope boundary**: Application logs only. System-level logs remain out of scope.
- **Dashboard/alert decision**: First implementation is docs-only Grafana guidance with exact LogQL queries, not committed Grafana provisioning assets.
- **Live verification decision**: Worker-required verification is local/mock based. Real Grafana Cloud verification is an operator acceptance checklist unless valid credentials, deployment access, and Grafana access are already available.

## Shared Non-Goals

Do not implement:

- Grafana Alloy
- Promtail
- node_exporter
- Docker log driver changes
- systemd journal reading
- Docker container log reading
- Nginx access/error log reading
- browser/client log shipping
- high-cardinality Loki labels

Do not remove stdout logging or `/admin/logs`.

## Shared Environment Contract

Server-only required variables:

- `READIO_GRAFANA_LOKI_URL`
  - Grafana Cloud Loki push endpoint, usually ending in `/loki/api/v1/push`.
  - GitHub placement: `vars.READIO_GRAFANA_LOKI_URL`.
- `READIO_GRAFANA_LOKI_USER`
  - Grafana Cloud Logs user / instance id.
  - GitHub placement: `vars.READIO_GRAFANA_LOKI_USER`.
- `READIO_GRAFANA_LOKI_TOKEN`
  - Grafana Cloud Logs token.
  - GitHub placement: `secrets.READIO_GRAFANA_LOKI_TOKEN`.

Server-only optional variables:

- `READIO_LOKI_LOG_LEVEL`
  - default `info`; accepted values: `debug`, `info`, `warn`, `error`.
- `READIO_LOKI_BATCH_SIZE`
- `READIO_LOKI_FLUSH_INTERVAL_SECONDS`
- `READIO_LOKI_QUEUE_SIZE`

These variables must never be added to browser runtime config or browser env allowlists.

## Loki Label Contract

Allowed labels only:

- `service="readio-cloud"`
- `env` normalized to `production`, `preproduction`, or `unknown`
- `level` normalized to `debug`, `info`, `warn`, or `error`

Forbidden labels:

- request id
- route
- upstream host
- podcast id
- episode id
- GUID
- search term
- user or tenant id
- file path
- raw error string
- IP address
- user agent
- token/API key/secret/cookie/header values

Log line JSON may include sanitized fields useful for debugging:

- `ts`
- `level`
- `msg`
- `route` after existing closed-enum normalization
- `status`
- `elapsed_ms`
- `error_class`
- `request_id`

Do not put high-cardinality values in Loki labels.

## 00C1 — Backend Loki Shipper

### Scope

- `apps/cloud-api/main.go`
- `apps/cloud-api/admin.go`
- new Loki shipper implementation files under `apps/cloud-api/`
- focused backend tests under `apps/cloud-api/`

If 00C1 alone requires more than 10 files, stop and split before editing code.

### Required Implementation

1. Add a Loki client for `POST /loki/api/v1/push`.
2. Add a `slog.Handler` wrapper that fans out each accepted application log record to:
   - existing stdout handler
   - existing admin ring-buffer handler
   - Loki shipper queue when configured
3. Keep Loki disabled/no-op unless all required Loki env vars are configured.
4. Use a bounded in-memory queue and background flusher.
5. Never block request handling on Loki network I/O.
6. Drop logs when the queue is full and emit a bounded local signal.
7. Flush best-effort during server shutdown.
8. Keep HTTP timeouts short and bounded.
9. Use Basic Auth for Grafana Cloud Logs credentials.
10. Reuse the same sensitive-key redaction behavior as admin logs before any record is queued for Loki.
11. Do not send raw attrs before redaction.
12. Avoid raw secrets, API keys, tokens, cookies, authorization headers, local paths, transcript text, user content, or full Referer query strings.

### Tests

Add focused tests for:

1. Loki disabled when any required env var is missing.
2. Loki payload format matches `/loki/api/v1/push`.
3. Basic Auth header is set and never logged.
4. Labels are exactly `service`, `env`, and `level`.
5. Sensitive fields are redacted or omitted before queueing.
6. Full Referer path/query is not shipped.
7. Queue full does not block request handling.
8. Loki network errors do not fail requests.
9. Shutdown flushes queued logs best-effort.
10. Existing `/admin/logs` behavior remains intact.

### Verification

- `gofmt` changed Go files
- `pnpm -C apps/cloud-api exec go test ./...`
- `pnpm -C apps/cloud-api exec go vet ./...`
- `pnpm -C apps/cloud-api exec go build ./...`

## 00C2 — Deployment And Documentation

### Scope

- `.github/workflows/deploy-cloud-preprod.yml`
- `.github/workflows/deploy-cloud-prod.yml`
- `docker-compose.readio.yml`
- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/environment.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/environment.zh.mdx`
- relevant env allowlist tests/artifacts only if needed

If 00C2 alone requires more than 10 files, stop and split before editing.

### Required Implementation

1. Pass Loki env only to the backend container.
2. Use `vars.READIO_GRAFANA_LOKI_URL`.
3. Use `vars.READIO_GRAFANA_LOKI_USER`.
4. Use `secrets.READIO_GRAFANA_LOKI_TOKEN`.
5. Keep Loki env vars out of `/env.js`, browser runtime config, and browser allowlists.
6. Document that `/admin/logs` is memory-only and Grafana Loki is durable remote application logs.
7. Document that 00B metrics and 00C logs are separate pipelines.
8. Document that no Alloy/Promtail/system log agent is installed.
9. Document queue/full/failure behavior.

### Tests

Add or update tests that prove:

1. Loki secrets are not browser-exposed.
2. Browser env allowlist excludes all Loki env names.
3. Existing OTLP metrics env behavior is unchanged.

### Verification

- `pnpm -C apps/cloud-api exec go test ./...`
- docs are bilingual where counterpart docs exist
- workflow/env review confirms server-only Loki env flow

## 00C3 — Grafana Guidance And Live Acceptance

### Scope

- docs only unless there is an existing Grafana dashboard asset location already used by the repo
- no Grafana provisioning assets for first implementation unless already established locally

### Required Documentation

Document exact Grafana Explore queries:

- `{service="readio-cloud", env="preproduction"}`
- `{service="readio-cloud", env="preproduction", level="error"}`
- `{service="readio-cloud", env="production"}`
- `{service="readio-cloud", env="production", level="error"}`

Document one logs panel query:

```logql
{service="readio-cloud", env="$env"} | json
```

Document one sustained-error alert query:

```logql
sum(count_over_time({service="readio-cloud", env="production", level="error"}[5m])) > 0
```

Clarify that alert thresholds may need tuning after baseline traffic is known.

### Operator Live Verification Checklist

Real Grafana Cloud verification is required for final production acceptance, but the worker may leave it as an operator checklist if credentials/deploy/Grafana access are not available.

Checklist:

1. Deploy to preproduction with Loki env configured.
2. Generate one info log and one warning/error log through normal Cloud API traffic.
3. In Grafana Explore, query `{service="readio-cloud", env="preproduction"}`.
4. Query `{service="readio-cloud", env="preproduction", level="error"}`.
5. Confirm logs arrive within the configured flush interval.
6. Confirm sanitized log lines do not contain secrets, full Referer queries, local file paths, transcript text, or authorization headers.
7. Confirm metrics from 00B still arrive after enabling log shipping.

## Completion

- **Completed by**: Codex worker orchestration
- **Commands**:
  - `gofmt -w apps/cloud-api/loki.go apps/cloud-api/loki_test.go apps/cloud-api/admin.go apps/cloud-api/main.go apps/cloud-api/metrics_test.go`
  - `pnpm -C apps/cloud-api exec go test ./...`
  - `pnpm -C apps/cloud-api exec go vet ./...`
  - `pnpm -C apps/cloud-api exec go build ./...`
- **Date**: 2026-05-09
- **Reviewed by**: BA review, Reviewer review, Refactor review, Top final review
