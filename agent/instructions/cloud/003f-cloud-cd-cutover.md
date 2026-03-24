# Instruction 003f: Cloud CD Cutover

Parent:

- `agent/instructions/cloud/003-cloud-architecture.md`

## Goal

Update Cloud deployment from the scaffold-era contract to the final dual-artifact contract:

- build and publish `apps/cloud-ui`
- build and publish `apps/cloud-api`

## Changed Zone

Allowed areas:

- `.github/workflows/**`
- Cloud deployment docs
- Cloud handoff docs
- minimal build/package wiring files if required by the workflow

Out of scope:

- feature work in Lite
- feature work in Cloud UI
- feature work in Cloud API
- shared UI extraction

## Required Work

- update the Cloud CD workflow to build:
  - `apps/cloud-ui`
  - `apps/cloud-api`
- publish both artifacts to the VPS
- keep atomic release behavior
- keep rollback notes or rollback contract
- update smoke checks so deployment verifies:
  - backend health
  - frontend artifact presence
- remove assumptions that Cloud deploys a built Lite artifact

## Required Docs Sync

At minimum review and update:

- deployment docs under `apps/docs/content/docs/apps/cloud/**`
- Cloud handoff docs
- any instruction or README that still describes Cloud deployment as `apps/lite + apps/cloud`

## Required Tests / Verification

1. workflow YAML validation
2. build verification for `apps/cloud-ui`
3. build or test verification for `apps/cloud-api`
4. post-deploy smoke contract documented and executable

Recommended verification commands:

1. `pnpm --filter @readio/cloud-ui build`
2. `go test ./...` in `apps/cloud-api`
3. any workflow lint/check already used in the repo

## Done When

- Cloud CD no longer assumes Lite artifact deployment
- both Cloud artifacts are part of the deployment contract
- docs, smoke checks, and rollback notes reflect the new topology

## Do Not Fold In

- new feature work
- shared UI extraction
- Lite deployment changes unrelated to Cloud
