# Instruction Plan: Grafana Cloud Observability Integration

## Objective

Adopt **Grafana Cloud** as Readio Cloud's long-lived centralized observability platform while preserving the existing `/ops` lightweight operator page as the same-origin, low-dependency quick diagnosis surface.

This file is a master plan only. It is not directly executable by Worker. Implementation must happen through the atomic Cloud instructions listed below.

## Decision

- **Chosen platform**: Grafana Cloud.
- **Rejected for this stream**: the archived self-hosted Grafana + Loki + Tailscale plan in `agent/instructions/cloud/archived/002-cloud-observability-grafana-loki-tailscale.md`.
- **Existing `/ops` relationship**: `/ops` remains direct-URL only and continues to use `/admin/*` with manually entered Bearer token stored in `sessionStorage`. Grafana Cloud is additive and must not replace or weaken `/ops`.
- **Logging path**: application stdout remains the primary log source; host-side Grafana Alloy ships logs to Grafana Cloud Loki. Do not add an app-side Loki client unless a later instruction proves stdout shipping is insufficient.
- **Metrics path**: `apps/cloud-api` exposes a protected `/metrics` endpoint for host-side Alloy scrape. Do not implement app-side Prometheus remote write in this stream.
- **Frontend RUM path**: `apps/cloud-ui` uses Grafana Faro only when browser-public Faro config is explicitly present.

## Atomic Instruction Sequence

Execute in order:

1. `agent/instructions/cloud/014c-cloud-api-prometheus-metrics-endpoint.md`
2. `agent/instructions/cloud/014d-cloud-api-request-metrics-instrumentation.md`
3. `agent/instructions/cloud/014e-grafana-loki-alloy-log-shipping-docs.md`
4. `agent/instructions/cloud/014f-cloud-ui-grafana-faro-rum.md`
5. `agent/instructions/cloud/014g-grafana-cloud-alloy-host-monitoring-and-dashboards.md`

Each instruction must be completed, reviewed, and integrated before the next one starts.

## Global Non-Negotiable Constraints

### Preserve Existing Behavior

- `/ops` remains direct-URL only.
- Do not add `/ops` to main navigation.
- Do not change `/ops` token storage: `sessionStorage` only.
- Do not change `/admin/logs`, `/admin/health`, or `/admin/metrics/summary` response contracts.
- Do not change admin ring-buffer capacity rules, redaction rules, request exclusion rules, or newest-first ordering.
- Do not expose `READIO_ADMIN_TOKEN` through `/env.js`.

### Payload, Privacy, and Cost Safety

- Never log, export, or label raw upstream JSON arrays.
- Never log, export, or label audio chunks, request bodies, response bodies, transcript bodies, cookies, Bearer tokens, API keys, relay tokens, admin tokens, or local filesystem paths.
- Never use full URLs, query strings, fragments, podcast titles, episode titles, episode GUIDs, user search text, user IPs, raw error messages, or SQL statements as metric labels.
- Metrics labels must be closed low-cardinality enums such as `route`, `provider`, `status_class`, `error_class`, and `cache_status`.
- Grafana credentials are server/Alloy owned. They must never be `VITE_*`, emitted through `/env.js`, committed, or baked into static frontend assets.
- Missing Grafana env/config must not fail Cloud API startup or Cloud UI boot.

### Required Multi-Role Flow

For each atomic instruction:

1. Worker reads `agent/role-prompt/worker-role`, the instruction, and relevant docs.
2. Worker performs the required 8-scope pre-implementation scan.
3. Worker writes tests before fixes for bugs and adds focused tests for new behavior.
4. Security reviews any changed trust boundary, runtime config, telemetry export, or deployment surface.
5. Refactor reviews structure and confirms no `/ops` behavior regression or duplicate observability path.
6. Reviewer gates instruction completeness, tests, docs, and lifecycle fields.
7. Top performs final consistency review before the next instruction starts.

## Documentation Lifecycle

- Rule-changing decisions require `apps/docs/content/docs/general/decision-log.mdx` and `.zh.mdx`.
- Runtime/deployment changes require `apps/docs/content/docs/apps/cloud/deployment.mdx` and `.zh.mdx`.
- Cloud handoff changes require the relevant sub-doc under `apps/docs/content/docs/apps/cloud/handoff/`; use `index.mdx` only for map/status-level notes.
- `technical-roadmap.mdx` and `.zh.mdx` may be updated only after Reviewer approval for the completed instruction.

## Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
