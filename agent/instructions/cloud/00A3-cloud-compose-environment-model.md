# Instruction 00A3 — Cloud Compose Environment Model [COMPLETED]

## Objective

Refactor `docker-compose.readio.yml` so runtime variables are explicit and CI no longer generates plaintext env files on the VPS.

This is the third child instruction of `00A-cloud-advanced-deployment-architecture.md`.

## Decision Log

- **Required / Waived**: Waived. Covered by the 00A architecture decision.

## Bilingual Sync

- **Required / Not applicable**: Required if deployment or handoff docs are changed.

## Scope

Allowed:

- `docker-compose.readio.yml`
- root `Makefile` only if needed to support validation from 00A2
- deployment/handoff docs if runtime ownership changes

Forbidden in this instruction:

- `.github/workflows/**`
- Ansible provisioning files
- product source code under `apps/**/src`
- Grafana Alloy or host observability agents

If more than 10 files are required, stop and split.

## Required Changes

1. Remove `env_file:` from `docker-compose.readio.yml`.
2. Explicitly list required runtime variables under `environment:`.
3. Preserve healthcheck behavior.
4. Preserve SQLite data volume mapping.
5. Preserve production/preproduction isolation through variables.
6. Keep browser-public config separate from server-owned secrets.
7. Keep `READIO_CLOUD_DB_PATH` mapped to the container data path.

## Required Environment Classification

Classify variables in docs or comments as:

- server secret
- server non-secret runtime variable
- browser-public runtime variable
- deployment-only variable

Server secrets include:

- `READIO_ADMIN_TOKEN`
- `PODCAST_INDEX_API_KEY`
- `PODCAST_INDEX_API_SECRET`
- `READIO_ASR_WORKER_SHARED_SECRET`
- `READIO_GRAFANA_OTLP_TOKEN`

Server non-secret runtime variables include:

- `READIO_ASR_ALLOWED_ORIGINS`
- `READIO_DISCOVERY_ALLOWED_ORIGINS`
- `READIO_PROXY_ALLOWED_ORIGINS`
- `READIO_GRAFANA_OTLP_ENDPOINT`
- `READIO_GRAFANA_OTLP_INSTANCE_ID`
- `READIO_TRUSTED_PROXY_CIDRS`
- `READIO_ASR_WORKER_BASE_URL`

Browser-public variables include only values safe for `/env.js`, such as:

- `READIO_ASR_RELAY_PUBLIC_TOKEN`
- `READIO_EN_DICTIONARY_API_URL`
- `READIO_EN_DICTIONARY_API_TRANSPORT`
- `VITE_GRAFANA_FARO_URL`
- `VITE_GRAFANA_FARO_APP_NAME`
- `VITE_GRAFANA_FARO_ENV`
- `VITE_GRAFANA_FARO_SAMPLE_RATE`

## Secret Boundary

Do not call this "fileless secrets" or "memory-only secrets."

Compose interpolation avoids CI writing a plaintext env file to the VPS, but the resulting container environment can be visible to Docker administrators and may be persisted by Docker daemon metadata.

## Required Validation

Validation must catch missing required variables before deployment.

Do not allow empty required secrets to silently become empty container env values.

## Verification

- `docker compose -f docker-compose.readio.yml config` succeeds with a complete test environment.
- The same config command fails or is blocked by Makefile validation when required variables are missing.
- Generated config does not include `env_file:`.
- Server secrets are not added to `apps/cloud-api/browser-env-allowlist.json`.
- If docs are changed, English and Chinese docs are synced.

## Completion

- **Completed by**: Worker A3
- **Commands**:
  - `make check-env-pre` (expected missing-variable failure)
  - `make check-env-prod` (expected missing-variable failure)
  - `env CLOUD_SSH_HOST=example.invalid CLOUD_SSH_PORT=22 CLOUD_SSH_USER=deploy REPO_OWNER=example IMAGE_TAG=test READIO_ADMIN_TOKEN=dummy PODCAST_INDEX_API_KEY=dummy PODCAST_INDEX_API_SECRET=dummy READIO_ASR_RELAY_PUBLIC_TOKEN=dummy PODCAST_INDEX_USER_AGENT=readio-test READIO_ASR_WORKER_SHARED_SECRET=dummy READIO_GRAFANA_OTLP_TOKEN=dummy READIO_ASR_ALLOWED_ORIGINS=https://pre.example.invalid READIO_DISCOVERY_ALLOWED_ORIGINS=https://pre.example.invalid READIO_PROXY_ALLOWED_ORIGINS=https://pre.example.invalid READIO_GRAFANA_OTLP_ENDPOINT=https://otel.example.invalid READIO_GRAFANA_OTLP_INSTANCE_ID=pre READIO_TRUSTED_PROXY_CIDRS=127.0.0.1/32 READIO_ASR_WORKER_BASE_URL=https://asr.example.invalid READIO_EN_DICTIONARY_API_URL=https://dict.example.invalid READIO_EN_DICTIONARY_API_TRANSPORT=cloud VITE_GRAFANA_FARO_URL=https://faro.example.invalid VITE_GRAFANA_FARO_APP_NAME=readio VITE_GRAFANA_FARO_ENV=pre VITE_GRAFANA_FARO_SAMPLE_RATE=1 DRY_RUN=1 make deploy-pre`
  - `env CLOUD_SSH_HOST=example.invalid CLOUD_SSH_PORT=22 CLOUD_SSH_USER=deploy REPO_OWNER=example IMAGE_TAG=test READIO_ADMIN_TOKEN=dummy PODCAST_INDEX_API_KEY=dummy PODCAST_INDEX_API_SECRET=dummy READIO_ASR_RELAY_PUBLIC_TOKEN=dummy PODCAST_INDEX_USER_AGENT=readio-test READIO_ASR_WORKER_SHARED_SECRET=dummy READIO_GRAFANA_OTLP_TOKEN=dummy READIO_ASR_ALLOWED_ORIGINS=https://prod.example.invalid READIO_DISCOVERY_ALLOWED_ORIGINS=https://prod.example.invalid READIO_PROXY_ALLOWED_ORIGINS=https://prod.example.invalid READIO_GRAFANA_OTLP_ENDPOINT=https://otel.example.invalid READIO_GRAFANA_OTLP_INSTANCE_ID=prod READIO_TRUSTED_PROXY_CIDRS=127.0.0.1/32 READIO_ASR_WORKER_BASE_URL=https://asr.example.invalid READIO_EN_DICTIONARY_API_URL=https://dict.example.invalid READIO_EN_DICTIONARY_API_TRANSPORT=cloud VITE_GRAFANA_FARO_URL=https://faro.example.invalid VITE_GRAFANA_FARO_APP_NAME=readio VITE_GRAFANA_FARO_ENV=prod VITE_GRAFANA_FARO_SAMPLE_RATE=1 DRY_RUN=1 CONFIRM=deploy make deploy-prod`
  - `ruby -e 'require "yaml"; YAML.load_file("docker-compose.readio.yml"); puts "ok"'`
  - `docker compose version` (not available locally: `docker` command not found)
  - `rg -n "READIO_ADMIN_TOKEN|PODCAST_INDEX_API_KEY|PODCAST_INDEX_API_SECRET|READIO_ASR_WORKER_SHARED_SECRET|READIO_GRAFANA_OTLP_TOKEN" apps/cloud-api/browser-env-allowlist.json` (no matches)
- **Date**: 2026-05-09
- **Reviewed by**: BA, Security, Refactor, Reviewer, Top final review
