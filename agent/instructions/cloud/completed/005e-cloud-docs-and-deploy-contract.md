# Instruction 005e: Cloud Docs And Deploy Contract [COMPLETED]

## Parent
- `005-cloud-networking-cutover.md`

## Objective
Sync documentation and deployment/runtime contract after the Cloud networking cutover is complete.

## Goal
After this instruction:

- Cloud docs describe Go-owned networking correctly
- deployment/runtime docs match the actual Cloud contract
- handoff docs stop describing Cloud as a pure Lite-networking clone

## Required Work
Review and update the relevant docs under:

- `apps/docs/content/docs/apps/cloud/**`
- `apps/docs/content/docs/general/**`
- any active Cloud instruction or handoff doc that still describes Cloud as browser-direct after `005a` to `005d`

At minimum, ensure docs state:

- Cloud UI is served by `apps/cloud-api`
- Cloud discovery/search/feed networking is backend-owned
- Cloud Settings does not include the `CORS Proxy` block
- Cloud deploy/runtime contract uses the Go service and Cloud UI static build

If deployment workflow/runtime assumptions changed, sync:

- `.github/workflows/cd-cloud.yml`
- related Cloud deployment docs

## Tests / Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. any workflow/config validation needed by the changed deploy contract
4. targeted text search ensuring docs do not describe the old networking model for migrated flows

## Done When
- docs and deploy contract match the implemented Cloud networking model
- Cloud handoff docs are no longer misleading
- verification commands are green

## Completion
- Completed by: Codex execution worker
- Reviewed by: Codex reviewer
- Commands: reran `go test ./...` in `apps/cloud-api`; reran `pnpm -C apps/cloud-ui build`; `git diff --check`; `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/cd-cloud.yml")'`; `rg -n "Build Cloud UI and Cloud API|新主机 VPS 启动|PORT=8080|READIO_CLOUD_UI_DIST_DIR|READIO_CLOUD_DB_PATH|systemctl restart|systemctl is-active|Apple|backend-owned|same-origin|CORS Proxy|READIO_PORT|Lite and Cloud" apps/docs/content/docs/apps/cloud .github/workflows/cd-cloud.yml agent/instructions/cloud/005e-cloud-docs-and-deploy-contract.md`
- Date: 2026-03-27
