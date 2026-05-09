# Instruction 00A4 — Cloud GitHub Actions Cutover and Docs Sync [COMPLETED]

## Objective

Cut over Cloud deployment workflows from inline SSH/scp scripts to Makefile-driven Docker Context deployment, then synchronize deployment documentation.

This is the fourth child instruction of `00A-cloud-advanced-deployment-architecture.md`.

## Decision Log

- **Required / Waived**: Waived. Covered by the 00A architecture decision.

## Bilingual Sync

- **Required / Not applicable**: Required.

## Scope

Allowed:

- `.github/workflows/deploy-cloud-prod.yml`
- `.github/workflows/deploy-cloud-preprod.yml`
- deployment docs:
  - `apps/docs/content/docs/apps/cloud/deployment.mdx`
  - `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
- relevant Cloud handoff docs if runtime ownership changes

Forbidden in this instruction:

- Ansible provisioning logic
- product source code under `apps/**/src`
- `docker-compose.readio.yml` model changes unless a small correction is required from 00A3 review
- Grafana Alloy or host observability agents

If more than 10 files are required, stop and split.

## Required Workflow Changes

1. Keep checkout, short SHA, GHCR login, and Docker image build/push.
2. Remove `appleboy/ssh-action` deployment blocks.
3. Remove `appleboy/scp-action` deployment blocks.
4. Configure SSH for Docker Context without interactive prompts.
5. Pass GitHub secrets and variables through step `env:`.
6. Call:
   - `make context-setup`
   - `make deploy-pre`
   - `make deploy-prod CONFIRM=deploy`
7. Preserve production manual confirmation behavior.
8. Preserve preproduction automatic deploy-on-main behavior.
9. Preserve GHCR cleanup behavior, either through the existing action or a Makefile/script target.

## Required Environment Mapping

Production and preproduction workflows must pass the same classified variables expected by 00A2 and 00A3.

Secrets must be passed through GitHub `secrets.*`.

Non-secret deployment variables may come from GitHub `vars.*` or workflow-computed values.

Do not print secret values in workflow logs.

## Required Documentation Updates

Docs must state:

- deployment uses Docker Context over SSH
- CI no longer writes plaintext env files on the VPS
- Docker container env remains in the Docker admin boundary, not memory-only
- Grafana Alloy is not used
- app metrics are pushed by `apps/cloud-api` through OTLP when configured
- host logs and host metrics are unavailable unless 00B or another follow-up implements them
- `/admin/logs` remains memory-only and same-origin
- Docker logs remain available through Docker operations

Update English and Chinese docs together.

## Rollback Notes

Document operator rollback steps:

- identify the previous GHCR image tag
- rerun deploy with the previous `IMAGE_TAG`, or use a documented Makefile rollback target if added
- never delete `/etc/readio/pre/data` or `/etc/readio/prod/data`
- do not run destructive Docker volume cleanup as part of normal rollback

## Verification

- workflow syntax inspection
- `actionlint` if available
- `make check-env-pre` and `make check-env-prod` behavior still matches 00A2
- docs contain no Grafana Alloy requirement
- docs do not claim logs or host metrics are shipped to Grafana
- docs do not claim secrets are memory-only

## Completion

- **Completed by**: Codex Top-role orchestration
- **Commands**:
  - `ruby -e 'require "yaml"; YAML.load_file("docker-compose.readio.yml"); YAML.load_file(".github/workflows/deploy-cloud-preprod.yml"); YAML.load_file(".github/workflows/deploy-cloud-prod.yml"); puts "ok"'`
  - `bash -n scripts/readio-cloud-prune-images.sh`
  - `rg "appleboy|ENV_FILE_PATH|env_file|readio-pre.env|readio.env|sync_env|scp-action|ssh-action" .github/workflows Makefile docker-compose.readio.yml` (no matches)
  - `rg "Docker Context|plaintext env|Docker administrator|Docker 管理员|Grafana Alloy|host logs|host metrics|/admin/logs|Docker logs|主机日志|主机指标" apps/docs/content/docs/apps/cloud/deployment.mdx apps/docs/content/docs/apps/cloud/deployment.zh.mdx`
  - `command -v actionlint` (not available locally)
  - `command -v docker` (not available locally)
- **Date**: 2026-05-09
- **Reviewed by**: BA, Security, Refactor, Reviewer, Top final review
