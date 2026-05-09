# Instruction 00B — Cloud API Host Observability Without Agent [COMPLETED]

## Objective

Add host-critical operational metrics to `apps/cloud-api` without Grafana Alloy, node_exporter, Prometheus, Loki, or any host-side observability agent.

This instruction extends the existing Go-owned OTLP metrics pipeline. It does not add log shipping.

## Decision Log

- **Required / Waived**: Required. This instruction establishes the no-agent host metrics boundary.

## Bilingual Sync

- **Required / Not applicable**: Required if deployment or handoff docs are updated.

## Prerequisites

- `apps/cloud-api` already owns OTLP metric push through:
  - `READIO_GRAFANA_OTLP_ENDPOINT`
  - `READIO_GRAFANA_OTLP_INSTANCE_ID`
  - `READIO_GRAFANA_OTLP_TOKEN`
- Instruction 00A must state that Grafana Alloy and host observability agents are out of scope.

## Scope

Backend:

- `apps/cloud-api/metrics.go`
- focused tests for host metric collection and label safety
- small helper file under `apps/cloud-api/` if needed

Docs:

- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- relevant Cloud handoff docs if runtime observability ownership changes

Instruction lifecycle:

- `agent/instructions/cloud/00B-cloud-api-host-observability-without-agent.md`

If more than 10 files are required, stop and split.

## Non-Goals

Do not implement:

- Grafana Alloy
- node_exporter
- local Prometheus
- Loki log shipping
- OTLP log shipping
- systemd journal reading
- Docker logs reading
- Nginx logs reading
- durable remote application logs
- app-side remote write to Prometheus

`/admin/logs` remains the same-origin, memory-only operator log surface.

## Required Metrics

Add low-cardinality OTLP metrics for:

1. Go process/runtime:
   - goroutines
   - allocated heap bytes
   - system memory bytes used by Go runtime
   - process uptime seconds
2. SQLite persistence:
   - database file size bytes
   - WAL file size bytes when present
3. Storage pressure:
   - filesystem free bytes for the configured data directory
   - filesystem total bytes for the configured data directory
   - transcript asset directory size bytes when `PODCASR_TRANSCRIPTS_DIR` is configured

Optional, only if implemented with small Linux-only helpers and clear tests:

- host load average from `/proc/loadavg`
- host memory available/total from `/proc/meminfo`

## Metric Naming

Use stable names under the existing Readio Cloud namespace, for example:

- `readio_cloud_process_goroutines`
- `readio_cloud_process_heap_alloc_bytes`
- `readio_cloud_process_memory_sys_bytes`
- `readio_cloud_process_uptime_seconds`
- `readio_cloud_sqlite_db_size_bytes`
- `readio_cloud_sqlite_wal_size_bytes`
- `readio_cloud_data_filesystem_free_bytes`
- `readio_cloud_data_filesystem_total_bytes`
- `readio_cloud_transcript_assets_size_bytes`

If a name is changed during implementation, update docs and tests in the same task.

## Label Contract

Labels must stay low-cardinality and non-sensitive.

Allowed labels:

- `service` fixed to `readio-cloud`
- `env` from a bounded runtime env value, normalized to `production`, `preproduction`, or `unknown`
- `path_class` from a closed enum:
  - `data`
  - `sqlite`
  - `sqlite_wal`
  - `transcripts`

Forbidden labels and values:

- full filesystem paths
- file names other than closed enum path classes
- tenant/user identifiers
- podcast IDs, episode IDs, GUIDs, titles, search terms
- transcript text
- local media paths
- raw errors
- secrets, tokens, API keys, cookies, authorization headers

## Collection Rules

- Metrics must be collected on a bounded interval, default 60 seconds.
- Collection must never block request handling.
- Directory walking for transcript assets must be bounded:
  - skip hidden temp directories if present
  - cap total files visited per collection
  - cap collection time budget
  - expose stale last-known value if a collection exceeds budget
- Missing optional paths must produce safe zero or absent metrics; startup must continue.
- Permission errors must not panic or crash the server.
- Metric collection errors may be logged with sanitized, low-cardinality messages only.

## Required Implementation

1. Add a host metrics collector that plugs into the existing OpenTelemetry meter provider.
2. Use observable gauges or a background collector plus atomic last-known values.
3. Derive SQLite DB and WAL paths from `READIO_CLOUD_DB_PATH`.
4. Derive data filesystem path from the DB directory.
5. Derive transcript directory from `PODCASR_TRANSCRIPTS_DIR`.
6. Keep all metric labels closed and normalized.
7. Do not expose new server secrets through `/env.js` or browser allowlists.
8. Keep metrics disabled/no-op when OTLP is not configured, matching existing observability behavior.

## Tests

Add focused tests for:

1. SQLite DB and WAL size collection.
2. Missing WAL file reports zero or no unsafe error.
3. Data filesystem metrics use only `path_class`, not full paths.
4. Transcript directory size collection sums bounded test files.
5. Transcript walk budget/file cap prevents unbounded traversal.
6. Missing transcript directory does not fail startup.
7. Runtime metric collection returns non-negative values.
8. Env label normalizes to `production`, `preproduction`, or `unknown`.
9. Static or behavioral check that forbidden high-cardinality labels are not emitted.

## Verification

- `go test ./...` in `apps/cloud-api`
- `go vet ./...` in `apps/cloud-api`
- `go build ./...` in `apps/cloud-api`
- If docs changed, verify English and Chinese docs mention:
  - no Grafana Alloy
  - no log shipping
  - host metrics are emitted by `apps/cloud-api` through OTLP

## Documentation

Document:

- metrics names
- required env vars
- collection interval and cost notes
- storage path ownership
- that host metrics are best-effort app-owned signals, not a replacement for a full node exporter
- that logs remain available through Docker logs and `/admin/logs`, not Grafana Loki

## Forbidden Outcomes

- installing or documenting Grafana Alloy
- adding a log exporter
- adding unbounded directory walks on request paths
- adding full path labels
- sending raw filesystem errors with paths as labels
- exposing Grafana or server secrets to browser runtime config

## Completion

- **Completed by**: Codex Top-role orchestration
- **Commands**:
  - `gofmt -w apps/cloud-api/admin.go apps/cloud-api/host_metrics.go apps/cloud-api/host_metrics_test.go apps/cloud-api/metrics.go`
  - `GOCACHE=/tmp/readio-go-cache pnpm -C apps/cloud-api exec go test -run 'TestSlogHandlerExcludesAdminFromRing|TestHostMetric|TestBoundedDirectorySize|TestMissingTranscript|TestNormalizeMetricEnv' ./...`
  - `GOCACHE=/tmp/readio-go-cache pnpm -C apps/cloud-api exec go vet ./...`
  - `GOCACHE=/tmp/readio-go-cache pnpm -C apps/cloud-api exec go build ./...`
  - `GOCACHE=/tmp/readio-go-cache pnpm -C apps/cloud-api exec go test -timeout=2m ./...` (blocked in local sandbox: ASR relay tests require localhost listener permission and fail with `httptest: failed to listen on a port`)
- **Date**: 2026-05-09
- **Reviewed by**: Top final review
