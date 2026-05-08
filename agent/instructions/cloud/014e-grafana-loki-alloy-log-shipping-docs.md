# Instruction 014e — Grafana Loki via Alloy Log Shipping Docs [COMPLETED]

## Objective

Document Grafana Cloud Loki log shipping through host-side Grafana Alloy using existing `apps/cloud-api` stdout/systemd journal logs. This instruction must not add a Go Loki client.

## Decision Log

- **Required / Waived**: Waived. This follows the master Grafana Cloud decision and 014c Alloy scrape direction.

## Bilingual Sync

- **Required / Not applicable**: Required.

## Scope

Docs only:

- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- Relevant Cloud handoff sub-doc if needed

Do not modify product code.

## Required Content

1. State that Cloud API logs continue to go to stdout via `slog`.
2. State that Grafana Alloy reads `readio-cloud.service` systemd journal and ships to Grafana Cloud Loki.
3. Document secret ownership:
   - Grafana Cloud Loki endpoint/user/token live in Alloy config or a root-owned server env file.
   - No Loki credential is emitted through `/env.js`.
   - No Loki credential is added to frontend `.env` or Vite config.
4. Document log safety:
   - Keep existing structured fields: `route`, `upstream_kind`, `upstream_host`, `elapsed_ms`, `error_class`, `upstream_status`, `timed_out`, `cache_status`.
   - Do not log raw request/response bodies, raw PodcastIndex arrays, audio bytes, transcript bodies, full URLs, query strings, headers, cookies, API keys, admin tokens, relay tokens, or local paths.
5. Document recommended Loki labels:
   - `job=readio-cloud`
   - `env=production|preproduction`
   - `service=readio-cloud-api`
   - Do not promote full URL, route params, user input, or raw errors to labels.
6. Provide a minimal Alloy config skeleton with placeholders only.
7. Document rollback: stop Alloy or remove the Loki pipeline; app behavior remains unchanged.

## Verification

- `rg -n "GRAFANA|LOKI|Alloy|/env.js|READIO_ADMIN_TOKEN" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- Verify no real credentials or credential-shaped examples are written.

## Completion

- **Completed by**: Worker
- **Commands**:
  - `rg -n "GRAFANA|LOKI|Alloy|/env.js|READIO_ADMIN_TOKEN" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
  - `rg -n "(glc_|grafana_cloud_[A-Za-z0-9_]*=|https://[^<][^[:space:]]*/loki/api/v1/push|password = \"[^\"]*(glc_|eyJ|[A-Za-z0-9+/]{24,}=)[^\"]*\"|READIO_ADMIN_TOKEN=[^r][^[:space:]]+)" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx apps/docs/content/docs/apps/cloud/handoff/environment.mdx apps/docs/content/docs/apps/cloud/handoff/environment.zh.mdx`
- **Date**: 2026-05-07
- **Reviewed by**: Codex Reviewer, 2026-05-07
