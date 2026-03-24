# Instruction 003e: Rename Cloud Backend To Cloud API

Parent:

- `agent/instructions/cloud/003-cloud-architecture.md`

## Goal

Rename the current Go scaffold from `apps/cloud` to `apps/cloud-api` so the repository topology matches the settled architecture.

## Changed Zone

Allowed areas:

- `apps/cloud/**`
- `apps/cloud-api/**`
- workspace/package wiring files
- docs and instructions that reference the old path
- test/build path references

Out of scope:

- new feature work
- shared UI extraction
- Cloud CD cutover beyond the minimum path updates needed to keep repo tooling valid

## Required Work

- move the Go backend from `apps/cloud` to `apps/cloud-api`
- update package metadata, READMEs, docs, and instruction references
- update test/build commands and any package filters that reference the old path
- preserve current behavior; this is a path/topology task, not a feature task

## Required Docs Sync

At minimum review and update:

- `agent/instructions/cloud/003-cloud-architecture.md`
- `apps/docs/content/docs/general/monorepo-strategy.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/index.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/index.zh.mdx`
- any completed instruction or deployment doc that still references `apps/cloud` as the final backend location

## Required Tests

1. backend tests still run from the new path
2. any frontend or docs references to the backend path still resolve
3. no stale `apps/cloud` path remains in active build/test contracts

## Verification

1. `go test ./...` in `apps/cloud-api`
2. targeted repo-wide text search for stale active references to `/apps/cloud`

## Done When

- the backend lives at `apps/cloud-api`
- active repo contracts no longer treat `apps/cloud` as the final backend path
- docs and tests are synchronized

## Do Not Fold In

- new backend features
- shared UI extraction
- Cloud CD cutover beyond minimum path safety
