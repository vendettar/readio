# Grafana Dashboard Follow-ups

These items are intentionally deferred. Do not add dashboard panels for them
until the corresponding code or operational integration exists and the metric
names, labels, and semantics are stable.

## Go Runtime Metrics

Deferred items:

- GC pause latency
- GC rate
- Heap idle or heap fragmentation views

GC pause remains deferred because the current dashboard already has HTTP
quantiles, CPU, heap allocation, memory, goroutines, upstream latency, and slow
request logs. Add a GC pause panel only after there is evidence that P99 latency
is not explained by upstream, CPU, memory, or request traces.

When to implement:

- The Cloud API exposes stable Go runtime metrics through the existing OTLP
  path, or a dedicated runtime instrumentation plan is accepted.
- Metric names and units are documented.
- Dashboard queries can be validated against real data.

Do not add speculative panels that query metrics which are not currently
emitted. Empty panels make production debugging less trustworthy.

## SQLite Lock Contention

Deferred items:

- SQLite busy timeout count
- SQLite lock wait duration
- Write contention or transaction retry panels

When to implement:

- The database access layer records lock contention metrics with bounded label
  cardinality.
- The desired interpretation is clear: timeout count, wait duration, retry
  count, or transaction latency.
- Tests cover the new metric recording paths.

Storage size and WAL size panels are already useful for capacity visibility,
but they do not prove lock contention. Add lock panels only after DB-specific
instrumentation exists.

## Deployment Annotations

Deferred items:

- Deploy markers on the dashboard timeline
- Release or promotion annotations

When to implement:

- GitHub Actions or the deployment process pushes deploy events to Grafana.
- The annotation payload includes environment, service version, commit SHA, and
  deployment result.
- Failed or partial deploys have a defined annotation behavior.

Do not add placeholder annotations without a producer. The dashboard should not
imply deploy correlation until CI/CD actually emits those events.

## Duration Heatmap

Deferred item:

- HTTP request duration heatmap

When to implement:

- Existing latency quantile panels are no longer enough to distinguish latency
  distribution shape.
- The team wants to inspect bimodal latency, bucket density, or long-tail
  spread directly in the dashboard.
- The current histogram bucket boundaries are confirmed to be appropriate for a
  heatmap view.

Quantile panels and slow-request logs remain the primary latency debugging path
for now.

## Environment Multi-select

Deferred item:

- Multi-select `env` variable

When to implement:

- The dashboard is deliberately changed from a single-production overview to an
  environment comparison dashboard.
- All Prometheus selectors are migrated from `env="$env"` to `env=~"$env"`.
- Loki queries and panel descriptions are reviewed for multi-environment
  behavior.

The current dashboard's role is single-version production monitoring, so
`env` remains single-select.
