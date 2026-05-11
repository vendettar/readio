# Instruction 00D — Cloud API Grafana Tempo Tracing Without Agent [COMPLETED]

<!--
Reviewed by: Top (agent)
Completed: 2026-05-11
Commit: 762add94
Phases: 00D0–00D6 all implemented. 40+ tests. Full suite green. gofmt clean.
Security review: no secret/URL/query leakage in spans or logs. OTLP_HEADERS browser-excluded.
-->


## Objective

Implement distributed tracing for `apps/cloud-api` and push traces directly from the Go binary to Grafana Cloud Tempo through OTLP/HTTP.

This must stay agentless:

- no Grafana Alloy
- no Promtail
- no sidecar collector
- no host-level tracing daemon

This instruction extends the existing Go-owned observability model:

- `00B`: OTLP metrics
- `00C`: Loki application log shipping
- `00D`: OTLP traces and log correlation

## Current Observability Contract

The intended production contract is:

- backend metrics: OTLP push from `apps/cloud-api`
- backend traces: OTLP push from `apps/cloud-api`
- backend application logs: Loki push from `apps/cloud-api`
- frontend browser telemetry: Grafana Faro from `apps/cloud-ui`
- host-level agents: not used

Do not reintroduce Grafana Alloy, Prometheus scrape requirements, Promtail, Docker log drivers, or host daemons as part of 00D.

## Important Grafana Cloud Credential Rule

Do not infer Tempo/OTLP credentials from the Prometheus data source page.

The source of truth for OTLP credentials is the Grafana Cloud OpenTelemetry / OTLP connection tile. Prefer copying the values Grafana gives for:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`

Token scopes:

- OTLP metrics require `metrics:write`.
- OTLP traces require `traces:write`.
- Because Readio uses one shared OTLP auth resolver for metrics and traces, `READIO_GRAFANA_OTLP_HEADERS` must be backed by a token that includes both `metrics:write` and `traces:write`.
- Do not configure a traces-only token in `READIO_GRAFANA_OTLP_HEADERS` unless a future implementation introduces signal-specific OTLP auth variables.
- Loki logs use a separate Loki pipeline by default and require `logs:write` only for the token configured as `READIO_GRAFANA_LOKI_TOKEN`.
- Only if operators intentionally reuse the same Grafana access policy token for OTLP metrics, OTLP traces, and Loki logs must that one token include all three scopes:
  - `metrics:write`
  - `traces:write`
  - `logs:write`

`logs:write metrics:write` is not sufficient for Tempo tracing.

## Environment Variables

Add shared OTLP config while preserving the existing metrics env contract.

Shared OTLP config:

- `READIO_GRAFANA_OTLP_ENDPOINT`
  - OTLP gateway base URL, usually copied from `OTEL_EXPORTER_OTLP_ENDPOINT`.
  - Example: `https://otlp-gateway-prod-us-west-0.grafana.net/otlp`
  - Do not include `/v1/metrics` or `/v1/traces`; code appends the signal path.
- `READIO_GRAFANA_OTLP_HEADERS`
  - preferred auth input
  - copied from Grafana's `OTEL_EXPORTER_OTLP_HEADERS`
  - expected to include `Authorization=Basic ...`
- `READIO_GRAFANA_OTLP_INSTANCE_ID`
  - fallback auth input only
- `READIO_GRAFANA_OTLP_TOKEN`
  - fallback auth input only

Tracing control:

- `READIO_TRACING_ENABLED`
  - default: `false`
  - production/preproduction tracing must be explicitly enabled
  - when false or unset, tracing must not create an exporter even if OTLP credentials are present
- `READIO_TRACING_SAMPLE_RATIO`
  - default when tracing is enabled: `0.1`
  - valid range: `0.0` to `1.0`
  - invalid values must be rejected when tracing is enabled
  - do not clamp invalid values
  - recommended preproduction initial value: `1.0`
  - recommended production initial value: `0.1`

Optional:

- `READIO_TRACING_EXPORT_TIMEOUT_SECONDS`
  - default: `5`
- `READIO_TRACING_BATCH_TIMEOUT_SECONDS`
  - default: OpenTelemetry SDK default unless explicitly needed

## Design Constraints

1. Tracing must be no-op when disabled, matching the existing metrics behavior.
2. Startup must not panic when tracing is disabled.
3. Startup must fail when tracing is explicitly enabled but required tracing credentials are invalid or incomplete.
4. Startup must fail when tracing is explicitly enabled and `READIO_TRACING_SAMPLE_RATIO` is outside `0.0..1.0` or cannot be parsed.
5. Do not leak secrets, full URLs, query strings, request bodies, podcast titles, user search text, API keys, `Referer`, or raw upstream payloads into span names or attributes.
6. Keep span names low-cardinality.
7. Use route templates, closed enum labels, and bounded status/error labels.
8. Do not add deep helper-level spans in the first implementation.
9. Keep trace shutdown flush bounded so deploy/restart does not hang the 1c1g VPS.
10. Preserve existing `request_id` as the user-visible support/debug identifier; do not replace it with `trace_id`.
11. Public/user-facing API responses must not include `trace_id`; authenticated admin/ops surfaces may expose it only if explicitly documented.

## Phase 00D0 — Observability Contract Cleanup

Before implementing tracing, remove or correct stale docs that conflict with the current no-agent model.

Preflight tasks:

- Search docs and decision logs for stale Alloy / Prometheus scrape / host agent statements.
- Correct statements that imply production requires:
  - Grafana Alloy
  - Prometheus scrape
  - Promtail
  - Docker log driver
  - host observability agent
- Ensure docs consistently say:
  - metrics use OTLP push
  - traces use OTLP push
  - logs use Loki push
  - frontend browser telemetry uses Faro
- If a historical decision log is intentionally kept for record, add a note that it has been superseded by 00A/00B/00C/00D.

Tests/checks:

- `rg -n "Alloy|Prometheus scrape|Promtail|Docker log driver|host agent" apps/docs agent/instructions/cloud` reviewed for active docs and decision logs.
- Historical or completed instructions may keep old terms for audit history, but active docs must not imply that Alloy, Prometheus scrape, Promtail, Docker log drivers, or host agents are required.

## Phase 00D1 — Shared OTLP Config And Auth

Refactor OTLP endpoint/auth handling into a shared resolver used by both metrics and tracing.

Create or update an internal helper, for example:

- `resolveOTLPConfig(signal string) (otlpConfig, error)`
- `otlpConfig.EndpointURL(signalPath string) string`
- `otlpConfig.Headers() map[string]string`

Requirements:

- metrics and traces must use the same resolver
- auth priority:
  1. `READIO_GRAFANA_OTLP_HEADERS`
  2. fallback Basic auth from `READIO_GRAFANA_OTLP_INSTANCE_ID:READIO_GRAFANA_OTLP_TOKEN`
- endpoint base:
  - trim trailing slash
  - append `/v1/metrics` for metrics
  - append `/v1/traces` for traces
- `READIO_GRAFANA_OTLP_HEADERS` parsing:
  - support OpenTelemetry env format, including comma-separated key/value pairs
  - at minimum support `Authorization=Basic ...`
  - support percent-encoded OpenTelemetry header values such as `Authorization=Basic%20...`
  - reject malformed entries when the corresponding signal is enabled
  - only forward explicitly allowed headers needed for OTLP export
  - reject empty keys, empty `Authorization`, and unknown headers instead of forwarding them
- do not log header/token values
- do not put `READIO_GRAFANA_OTLP_HEADERS`, `READIO_GRAFANA_OTLP_TOKEN`, or other OTLP secrets in `apps/cloud-api/browser-env-allowlist.json`

Metrics compatibility:

- Existing metrics behavior must continue to work with `READIO_GRAFANA_OTLP_INSTANCE_ID` and `READIO_GRAFANA_OTLP_TOKEN`.
- Metrics should also work when only `READIO_GRAFANA_OTLP_HEADERS` is configured.
- Metrics disabled/no-op means no OTLP endpoint/auth env is configured.
- If only part of the OTLP endpoint/auth env is configured, return a clear startup error instead of silently disabling metrics.
- If `READIO_GRAFANA_OTLP_HEADERS` is configured but malformed, return a clear startup error instead of silently falling back or sending invalid credentials.
- If metrics are enabled by any complete OTLP auth path but auth is malformed, return a clear startup error rather than silently sending invalid credentials.
- The goal is to catch misconfiguration before the app runs long enough to emit repeated Grafana `401 Unauthorized` upload failures.

Tests:

- headers auth takes precedence over instance/token fallback
- fallback Basic auth builds expected Authorization header
- metrics exporter receives `/v1/metrics`
- trace exporter receives `/v1/traces`
- malformed headers fail when signal is enabled
- percent-encoded header values from Grafana's OpenTelemetry tile parse correctly
- empty header keys, empty `Authorization`, and unknown headers fail fast
- partial endpoint/auth configuration fails fast
- OTLP secrets and headers are absent from browser env allowlist
- existing metrics disabled/no-op tests still pass

## Phase 00D2 — Tracing Foundation

Create `apps/cloud-api/trace.go`.

Implement:

- `initTracing(ctx context.Context) (tracingShutdown, error)`
- no-op shutdown when `READIO_TRACING_ENABLED` is false or unset
- OTLP/HTTP trace exporter using:
  - `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp`
  - `go.opentelemetry.io/otel/sdk/trace`
  - `go.opentelemetry.io/otel/sdk/resource`
- resource attributes:
  - `service.name=readio-cloud`
  - `service.version` from `READIO_APP_VERSION` or existing default
  - `deployment.environment` from `READIO_DEPLOY_ENV`, normalized to `production`, `preproduction`, or `unknown`
- sampler:
  - `sdktrace.ParentBased(sdktrace.TraceIDRatioBased(READIO_TRACING_SAMPLE_RATIO))`
- auth and endpoint from the shared OTLP resolver
- propagator:
  - set global propagation to W3C TraceContext only
  - do not enable baggage in the first implementation

Implementation notes:

- Tracing disabled means no exporter is created, even if OTLP credentials exist.
- Tracing enabled with incomplete endpoint/auth fails fast.
- Invalid sample ratio fails fast when tracing is enabled.
- Empty sample ratio uses the default `0.1`.
- Initialize tracing before wrapping inbound handlers or creating outbound instrumented clients.
- Stop the HTTP server first during shutdown, then flush the trace provider with the configured bounded timeout.
- Tests that install a global OpenTelemetry tracer provider must restore a no-op or previous provider before returning so other tests are not polluted.
- Tests that install a global propagator must restore the previous propagator before returning.
- Do not log token/header values.
- Log only whether tracing is enabled, endpoint host/path, environment, and sample ratio.

Tests:

- disabled by default
- disabled when `READIO_TRACING_ENABLED=false`
- credentials present do not auto-enable tracing
- explicit enable fails when endpoint is missing
- explicit enable fails when auth is missing
- explicit enable fails on malformed headers
- explicit enable fails on invalid sample ratio
- empty sample ratio uses `0.1`
- valid sample ratio is applied

## Phase 00D3 — Inbound HTTP Tracing

Add inbound request tracing around the main HTTP handler.

Use:

- `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp`

Requirements:

- wrap the final application handler once, close to server startup
- do not use raw `r.URL.Path` as the final span name
- do not include query strings, podcast IDs, GUIDs, search terms, or user text in span names
- use a fixed route resolver that maps requests to route templates
- record HTTP method and status code
- avoid full URL and query attributes
- do not record unsafe HTTP attributes such as:
  - `url.full`
  - raw path values containing IDs or GUIDs
  - raw query strings
  - user search terms
  - `Referer`
- if the selected `otelhttp` version emits unsafe attributes by default, add hooks, wrappers, or attribute filtering so unsafe attributes are removed; do not relax tests to accept library defaults
- health/config route inclusion must be explicit:
  - either exclude `/healthz`
  - or include it only with low sampling and a fixed span name

Preferred route naming:

- `/healthz`
- `/api/v1/config`
- `/api/proxy`
- `/api/v1/asr/transcriptions`
- `/api/v1/asr/verify`
- `/api/v1/discovery/top-podcasts`
- `/api/v1/discovery/top-episodes`
- `/api/v1/discovery/search/podcasts`
- `/api/v1/discovery/search/episodes`
- `/api/v1/discovery/podcasts/{id}/episodes`
- `/api/v1/discovery/podcasts/batch`
- `/admin/*`
- `unknown`

Tests:

- middleware creates a valid server span for a representative route
- route name uses template form for podcast episode paths
- route name does not include query strings
- route name does not include podcast IDs, GUIDs, or search terms
- `?q=secret` does not appear in span name or attributes
- collected span attributes do not include `url.full`, raw query strings, `Referer`, podcast IDs, GUIDs, or search text
- tracing disabled leaves handler behavior unchanged

## Phase 00D4 — Conservative Outbound Tracing

Instrument only selected controlled outbound HTTP requests in the first implementation.

Use:

- `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp`
- `otelhttp.NewTransport`

Allowed first-phase targets:

- PodcastIndex API calls
- first-party ASR worker calls
- other tightly controlled first-party or configured upstreams where URL shape is known and bounded

Explicitly out of scope for first phase:

- arbitrary media/proxy fallback upstream calls
- user-supplied media URLs
- arbitrary podcast enclosure URLs
- third-party ASR provider upstreams such as OpenAI, Groq, or other external model APIs

Reason:

- arbitrary media/proxy upstreams can point to third-party hosts
- outbound instrumentation may inject `traceparent`
- trace context should not be sent to arbitrary third-party media hosts or model providers by default
- some OTel HTTP instrumentation/semconv versions may record full URL attributes unless carefully configured

Requirements:

- use a shared helper to wrap transports so behavior is consistent
- preserve existing timeout, redirect, and transport behavior
- only controlled outbound clients may use transports that inject `traceparent`
- only first-party ASR worker calls may propagate `traceparent` in the first implementation
- PodcastIndex calls may create local outbound child spans, but must not inject `traceparent` or baggage into requests
- do not enable baggage propagation
- span names must be low-cardinality
- attributes may include bounded upstream provider labels such as:
  - `podcastindex`
  - `asr_worker`
  - `unknown`
- do not attach full upstream URLs, query strings, tokens, or request bodies
- do not instrument arbitrary media/proxy upstreams in this phase
- do not instrument third-party ASR provider upstreams or propagate `traceparent` to them in this phase

Future media/proxy tracing may be considered only if:

- propagation is explicitly disabled for arbitrary third-party hosts
- tests prove no `traceparent` is sent to arbitrary media hosts
- tests prove no full URL or query string is recorded
- the added value outweighs privacy and complexity risk

Tests:

- controlled outbound client uses an instrumented transport when tracing is enabled
- existing timeout/transport settings are preserved
- upstream span attributes use bounded provider/route labels
- no full upstream URL appears in span attributes
- PodcastIndex outbound requests create local spans without sending `traceparent`
- first-party ASR worker outbound requests may send `traceparent`
- arbitrary media/proxy upstream code path is not instrumented
- third-party ASR provider code paths are not instrumented and do not receive `traceparent`

## Phase 00D5 — Loki Trace Correlation

Add trace correlation to application logs shipped to Loki.

Requirements:

- request-scoped log calls should use `slog.InfoContext`, `slog.WarnContext`, or `slog.ErrorContext` where a request context exists
- global startup/shutdown logs may remain context-free
- extract trace context from `slog.Handler.Handle(ctx, record)` or the request context flowing into the Loki enqueue path
- Loki JSON payload should include:
  - `trace_id`
  - `span_id`
- add these fields only when the context contains a valid span context
- keep existing Loki labels low-cardinality
- do not promote `trace_id` to a Loki stream label
- do not return `trace_id` in public/user-facing API responses
- authenticated admin/ops log APIs may expose `trace_id` and `span_id` if documented as an operator-only diagnostic field
- continue returning/preserving existing `request_id` for user-visible support and API error contracts

Implementation guidance:

- add a small helper that extracts `trace.SpanContextFromContext(ctx)`
- thread request contexts into the admin log entry / Loki enqueue path where needed
- update only request-path logs needed for correlation in this phase; do not churn every `slog` call in the codebase
- store trace fields in the structured log payload sent to Loki, not in stream labels

Tests:

- Loki payload includes `trace_id` and `span_id` when context has a valid span
- Loki payload omits trace fields when no span exists
- `trace_id` is not used as a Loki label
- public API responses still expose `request_id`, not `trace_id`
- authenticated admin log APIs either expose documented trace fields or explicitly omit them; choose one behavior and cover it with tests
- existing Loki batching and redaction tests still pass

## Phase 00D6 — Deployment, Docs, and Verification

Update deployment plumbing only after code and tests pass.

Files likely involved:

- `.github/workflows/_deploy-cloud-base.yml`
- deployment docs under `apps/docs/content/docs/apps/cloud/`
- handoff docs under `apps/docs/content/docs/apps/cloud/handoff/`

Add environment propagation for:

- `READIO_TRACING_ENABLED`
  - GitHub placement: environment variable (`vars.READIO_TRACING_ENABLED`)
- `READIO_TRACING_SAMPLE_RATIO`
  - GitHub placement: environment variable (`vars.READIO_TRACING_SAMPLE_RATIO`)
- `READIO_GRAFANA_OTLP_HEADERS` if using the preferred header-based auth path
  - GitHub placement: secret (`secrets.READIO_GRAFANA_OTLP_HEADERS`)
  - must never be written to `/env.js`, browser runtime config, browser allowlists, logs, or docs examples with real values

Preserve existing propagation for:

- `READIO_GRAFANA_OTLP_ENDPOINT`
- `READIO_GRAFANA_OTLP_INSTANCE_ID`
- `READIO_GRAFANA_OTLP_TOKEN`

Docs must state:

- metrics and traces may share the same OTLP endpoint and auth resolver
- metrics require `metrics:write`
- traces require `traces:write`
- Loki logs use `READIO_GRAFANA_LOKI_*` and require `logs:write`
- the Grafana OpenTelemetry tile is the source of truth for OTLP endpoint and headers
- `trace_id` is a log payload field, not a Loki label
- production should start with sampling below 100%
- frontend Faro remains separate from backend Tempo tracing
- Loki-to-Tempo navigation depends on Grafana data source derived field behavior; document the operator verification and any manual data source setting needed if Grafana does not auto-link `trace_id`

Verification checklist:

1. Generate or verify a Grafana Cloud access policy token with `metrics:write` and `traces:write` for shared OTLP headers.
2. Prefer verifying OTLP auth using the OpenTelemetry tile's `OTEL_EXPORTER_OTLP_HEADERS`.
3. Deploy to preproduction with:
   - `READIO_TRACING_ENABLED=true`
   - `READIO_TRACING_SAMPLE_RATIO=1.0`
4. Hit:
   - `/healthz` if included
   - `/api/v1/config`
   - one discovery endpoint
   - one ASR relay or verify endpoint if safe
5. In Grafana Explore, query Tempo for `service.name="readio-cloud"`.
6. In Grafana Explore, query Loki:
   - `{service="readio-cloud", env="preproduction"}`
7. Confirm request logs include `trace_id`.
8. Confirm API responses still use `request_id`.
9. Open the trace from the Loki log line and verify the waterfall contains the inbound HTTP span.
10. If Loki does not show a Tempo link for `trace_id`, configure or document the required Loki data source derived field for Tempo.
11. Trigger one controlled upstream-backed route and verify outbound spans appear without unsafe attributes.
12. Confirm PodcastIndex outbound requests do not receive `traceparent`.
13. Confirm arbitrary media/proxy upstream requests do not receive `traceparent`.
14. Confirm third-party ASR provider requests do not receive `traceparent`.
15. Reduce production sampling before production deploy.

## Acceptance Criteria

- Tracing is disabled by default.
- OTLP endpoint/auth resolution is shared by metrics and traces.
- `READIO_GRAFANA_OTLP_HEADERS` is supported and takes precedence over instance/token fallback.
- Existing metrics export still works with the old instance/token fallback.
- Enabling tracing without valid OTLP config fails fast with a clear startup error.
- Enabling tracing with an invalid sample ratio fails fast.
- Partial or malformed OTLP metrics auth configuration fails fast instead of producing repeated runtime 401 upload failures.
- Preproduction can send traces to Grafana Cloud Tempo without Alloy.
- Inbound span names are route templates and never include query strings, podcast IDs, GUIDs, or user text.
- Inbound span attributes do not include full URLs, query strings, raw IDs/GUIDs, search text, or `Referer`.
- First-phase outbound tracing is limited to controlled upstreams.
- PodcastIndex outbound calls may create local spans but must not propagate `traceparent`.
- Arbitrary media/proxy upstreams are not instrumented and do not receive propagated trace headers.
- Third-party ASR provider upstreams are not instrumented and do not receive propagated trace headers.
- Logs shipped to Loki include `trace_id` and `span_id` when request context has a span.
- Trace IDs are not Loki labels and are not returned in public/user-facing API responses.
- Loki-to-Tempo navigation through `trace_id` is verified or documented with required derived field configuration.
- Existing `request_id` behavior remains intact.
- No secrets, raw URLs, query strings, request bodies, or user text are emitted as span attributes.
- Existing metrics and Loki log shipping continue to work.
- Unit tests cover shared OTLP config, auth precedence, disabled semantics, sampling validation, middleware route names, outbound transport policy, browser allowlist exclusions, and Loki trace correlation.
- Deployment docs explain the difference between OTLP metrics/traces, Loki logs, and Faro frontend telemetry.
