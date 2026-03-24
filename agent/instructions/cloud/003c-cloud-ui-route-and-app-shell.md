# Instruction 003c: Cloud UI Route And App Shell

Parent:

- `agent/instructions/cloud/003-cloud-architecture.md`

## Goal

Turn `apps/cloud-ui` from a set of local discovery slices into a minimal but real Cloud frontend app shell with explicit route/page organization.

This is a structural UI task:

- organize Cloud UI pages and local navigation
- preserve same-origin backend-owned networking
- do not introduce Lite page architecture wholesale

## Changed Zone

Allowed areas:

- `apps/cloud-ui/**`
- minimal docs sync only if Cloud UI structure becomes durable

Out of scope:

- `apps/cloud/**` endpoint expansion beyond what is required for existing slices
- `packages/ui/**`
- renaming `apps/cloud`
- updating `.github/workflows/cd-cloud.yml`

## Required Work

In `apps/cloud-ui`:

- introduce a minimal route/page structure for:
  - home
  - search
  - podcast detail
  - feed view if `003b` is already present
- introduce a minimal app shell:
  - header
  - navigation affordance
  - page container
  - consistent loading / error / empty shell behavior
- keep the route mechanism simple and app-owned
- do not pull in Lite's router or route tree wholesale
- preserve the existing same-origin data contract
- keep the visual design intentionally simple but coherent

## Design Constraints

- Cloud UI should look like a real app shell, not a demo card stack
- no `if (isCloud)` logic
- no CORS proxy mental model
- no direct Apple links as the primary navigation contract
- no premature `packages/ui` extraction in this task

## Required Tests

1. route transitions render deterministic page shells
2. current discovery slices still function inside the new shell
3. navigation does not trigger browser-direct Apple requests
4. loading / empty / error shell states remain deterministic per page

## Verification

1. `pnpm --filter @readio/cloud-ui build`
2. `pnpm --filter @readio/cloud-ui test`

## Done When

- `apps/cloud-ui` has a minimal, explicit page/app-shell structure
- the current discovery slices live inside that structure without regression
- no Lite router or large route tree has been copied in

## Do Not Fold In

- shared UI extraction
- search/feed endpoint expansion beyond current slice needs
- Cloud CD updates
- directory rename to `apps/cloud-api`
