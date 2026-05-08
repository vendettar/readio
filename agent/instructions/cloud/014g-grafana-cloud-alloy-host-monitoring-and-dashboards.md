# Instruction 014g — Grafana Cloud Alloy Host Monitoring and Dashboards [COMPLETED]

## Objective

Complete the Grafana Cloud integration with deployment docs for Alloy host monitoring, metric scraping, Loki shipping, dashboard expectations, and alerting rules. This instruction is primarily documentation and verification; it must not add app-side remote write.

## Decision Log

- **Required / Waived**: Waived. This follows prior Grafana Cloud decisions in this stream.

## Bilingual Sync

- **Required / Not applicable**: Required.

## Prerequisites

014c, 014d, 014e, and 014f must be completed and reviewed.

## Scope

Docs:

- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- Relevant Cloud handoff sub-doc if needed

Optional frontend:

- `/ops` may add a plain external link to Grafana Cloud only if this can be done without adding navigation, token coupling, iframes, or dashboard embedding. If this would exceed scope, leave `/ops` unchanged.

If more than 10 files are required, stop and split.

## Required Content

1. Alloy deployment model:
   - systemd journal -> Grafana Cloud Loki
   - localhost `/metrics` scrape -> Grafana Cloud metrics
   - host metrics -> Grafana Cloud metrics
2. Host metrics:
   - CPU
   - memory
   - disk usage
   - disk free under `/opt/readio/shared/data`
   - SQLite WAL growth watch
   - transcript asset storage pressure under `/opt/readio/shared/data/podcast/transcripts`
3. Access controls:
   - `/metrics` should be scraped locally or internally.
   - `/metrics`, `/admin/*`, and `/ops` should not be publicly exposed without outer restrictions.
4. Dashboard expectations:
   - upstream latency by provider/route
   - upstream error rate by provider/error class
   - ASR relay request count and errors
   - host disk pressure
   - Loki error queries for discovery/proxy/ASR
   - Faro frontend crash and schema diagnostic rate
5. Alert suggestions:
   - disk free below threshold
   - sustained 5xx/error_class rate
   - ASR relay failure spike
   - PodcastIndex/Apple latency p95 spike
   - Faro frontend crash spike
6. Cost controls:
   - log retention
   - Faro sample rate
   - avoid high-cardinality labels
   - do not promote raw log fields to labels
7. Rollback:
   - disable Alloy pipelines
   - clear Faro public config
   - leave `/ops` and `/admin/*` intact

## Verification

- `rg -n "Grafana|Alloy|Faro|/metrics|Loki|READIO_METRICS_TOKEN" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- Verify docs contain no real credentials.
- If `/ops` is changed, run the focused frontend tests and `pnpm -C apps/cloud-ui build`.

## Documentation

- Update deployment docs and zh counterpart.
- Do not update `technical-roadmap.mdx` until Reviewer approval.

## Completion

- **Completed by**: Worker
- **Commands**:
  - `rg -n "Grafana|Alloy|Faro|/metrics|Loki|READIO_METRICS_TOKEN" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
  - `rg -n "(glc_|grafana_cloud_[A-Za-z0-9_]*=|https://[^<][^[:space:]]*/loki/api/v1/push|password = \"[^\"]*(glc_|eyJ|[A-Za-z0-9+/]{24,}=)[^\"]*\"|READIO_(ADMIN|METRICS)_TOKEN=[^r][^[:space:]]+)" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx apps/docs/content/docs/apps/cloud/handoff/environment.mdx apps/docs/content/docs/apps/cloud/handoff/environment.zh.mdx`
- **Date**: 2026-05-07
- **Reviewed by**: Codex Reviewer, 2026-05-07
