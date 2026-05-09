# Instruction 00A2 — Cloud Makefile Docker Context Workflow [COMPLETED]

## Objective

Move Readio Cloud deployment operations into root Makefile targets that can run from both a developer machine and GitHub Actions.

This is the second child instruction of `00A-cloud-advanced-deployment-architecture.md`.

## Decision Log

- **Required / Waived**: Waived. Covered by the 00A architecture decision.

## Bilingual Sync

- **Required / Not applicable**: Required if deployment docs are changed.

## Scope

Allowed:

- root `Makefile`
- helper scripts under `scripts/` if needed
- docs explaining command usage

Forbidden in this instruction:

- `.github/workflows/**`
- `docker-compose.readio.yml` environment model changes
- product source code under `apps/**/src`
- Grafana Alloy or host observability agents

If more than 10 files are required, stop and split.

## Required Targets

Implement or prepare these targets:

- `check-env-pre`
- `check-env-prod`
- `context-setup`
- `deploy-pre`
- `deploy-prod`
- `logs-pre`
- `logs-prod`
- `prune-images-pre`
- `prune-images-prod`

## Required Variable Classes

The Makefile must validate variables by environment.

Deployment-only:

- `CLOUD_SSH_HOST`
- `CLOUD_SSH_PORT`
- `CLOUD_SSH_USER`
- `REPO_OWNER`
- `IMAGE_TAG`

Production/preproduction isolation:

- `IMAGE_NAME`
- `CONTAINER_NAME`
- `HOST_PORT`
- `APP_PORT`
- `DATA_DIR`
- `COMPOSE_PROJECT_NAME`

Server secrets:

- `READIO_ADMIN_TOKEN`
- `PODCAST_INDEX_API_KEY`
- `PODCAST_INDEX_API_SECRET`
- `READIO_ASR_WORKER_SHARED_SECRET`
- `READIO_GRAFANA_OTLP_TOKEN`

Server non-secret variables:

- `READIO_ASR_ALLOWED_ORIGINS`
- `READIO_DISCOVERY_ALLOWED_ORIGINS`
- `READIO_PROXY_ALLOWED_ORIGINS`
- `READIO_GRAFANA_OTLP_ENDPOINT`
- `READIO_GRAFANA_OTLP_INSTANCE_ID`
- `READIO_TRUSTED_PROXY_CIDRS`
- `READIO_ASR_WORKER_BASE_URL`

Browser-public variables:

- `READIO_ASR_RELAY_PUBLIC_TOKEN`
- `READIO_EN_DICTIONARY_API_URL`
- `READIO_EN_DICTIONARY_API_TRANSPORT`
- `VITE_GRAFANA_FARO_URL`
- `VITE_GRAFANA_FARO_APP_NAME`
- `VITE_GRAFANA_FARO_ENV`
- `VITE_GRAFANA_FARO_SAMPLE_RATE`

## Safety Requirements

- `deploy-prod` must require explicit confirmation, for example `CONFIRM=deploy`.
- `check-env-*` must fail before Docker context access if required variables are missing.
- Missing variable diagnostics must print names only, never values.
- `deploy-pre` and `deploy-prod` must use distinct project/container/port/data/image settings.
- `logs-*` must not require secrets.
- `prune-images-*` must preserve currently running images and a documented recent-image count.
- Commands must be idempotent.

## Secret Boundary

Do not claim secrets are memory-only. Docker Compose environment interpolation remains inside the Docker admin boundary and may be visible through Docker metadata to administrators.

This instruction may remove CI-generated env file mutation from the workflow, but must not claim that Docker cannot persist container env metadata.

## Verification

- `make check-env-pre` fails cleanly with missing variables.
- `make check-env-prod` fails cleanly with missing variables.
- `make deploy-prod` without `CONFIRM=deploy` fails before Docker access.
- `make context-setup DRY_RUN=1` or a documented equivalent shows intended Docker context behavior.
- If helper scripts are added, run `shellcheck` when available.

## Completion

- **Completed by**: Codex Top-role orchestration
- **Commands**:
  - `make check-env-pre` (expected missing-variable failure)
  - `make check-env-prod` (expected missing-variable failure)
  - `make deploy-prod` (expected `CONFIRM=deploy` failure before Docker access)
  - `env CLOUD_SSH_HOST=example.com CLOUD_SSH_PORT=22 CLOUD_SSH_USER=deploy REPO_OWNER=owner IMAGE_TAG=abc12345 READIO_ADMIN_TOKEN=admin PODCAST_INDEX_API_KEY=pi-key PODCAST_INDEX_API_SECRET=pi-secret READIO_ASR_WORKER_SHARED_SECRET=worker-secret READIO_GRAFANA_OTLP_TOKEN=otlp-token READIO_ASR_ALLOWED_ORIGINS=https://pre.example.com READIO_DISCOVERY_ALLOWED_ORIGINS=https://pre.example.com READIO_PROXY_ALLOWED_ORIGINS=https://pre.example.com READIO_GRAFANA_OTLP_ENDPOINT=https://otlp.example.com READIO_GRAFANA_OTLP_INSTANCE_ID=12345 READIO_TRUSTED_PROXY_CIDRS=127.0.0.1/32 READIO_ASR_WORKER_BASE_URL=https://worker.example.com READIO_ASR_RELAY_PUBLIC_TOKEN=relay-public READIO_EN_DICTIONARY_API_URL=https://dict.example.com READIO_EN_DICTIONARY_API_TRANSPORT=cloud VITE_GRAFANA_FARO_URL=https://faro.example.com VITE_GRAFANA_FARO_APP_NAME=readio-cloud VITE_GRAFANA_FARO_ENV=preproduction VITE_GRAFANA_FARO_SAMPLE_RATE=0.1 make deploy-pre DRY_RUN=1`
  - `env CLOUD_SSH_HOST=example.com CLOUD_SSH_PORT=22 CLOUD_SSH_USER=deploy REPO_OWNER=owner IMAGE_TAG=abc12345 READIO_ADMIN_TOKEN=admin PODCAST_INDEX_API_KEY=pi-key PODCAST_INDEX_API_SECRET=pi-secret READIO_ASR_WORKER_SHARED_SECRET=worker-secret READIO_GRAFANA_OTLP_TOKEN=otlp-token READIO_ASR_ALLOWED_ORIGINS=https://prod.example.com READIO_DISCOVERY_ALLOWED_ORIGINS=https://prod.example.com READIO_PROXY_ALLOWED_ORIGINS=https://prod.example.com READIO_GRAFANA_OTLP_ENDPOINT=https://otlp.example.com READIO_GRAFANA_OTLP_INSTANCE_ID=12345 READIO_TRUSTED_PROXY_CIDRS=127.0.0.1/32 READIO_ASR_WORKER_BASE_URL=https://worker.example.com READIO_ASR_RELAY_PUBLIC_TOKEN=relay-public READIO_EN_DICTIONARY_API_URL=https://dict.example.com READIO_EN_DICTIONARY_API_TRANSPORT=cloud VITE_GRAFANA_FARO_URL=https://faro.example.com VITE_GRAFANA_FARO_APP_NAME=readio-cloud VITE_GRAFANA_FARO_ENV=production VITE_GRAFANA_FARO_SAMPLE_RATE=0.1 make deploy-prod DRY_RUN=1 CONFIRM=deploy`
  - `bash -n scripts/readio-cloud-prune-images.sh`
  - `rg "appleboy|ENV_FILE_PATH|env_file|readio-pre.env|readio.env|sync_env|scp-action|ssh-action" .github/workflows Makefile docker-compose.readio.yml` (no matches)
- **Date**: 2026-05-09
- **Reviewed by**: BA, Security, Refactor, Reviewer, Top final review
