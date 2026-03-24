# Instruction 003d: First Shared UI Extraction

Parent:

- `agent/instructions/cloud/003-cloud-architecture.md`

## Goal

Extract the first small set of stable presentation components from Lite and Cloud UI into `packages/ui`, without moving networking, app bootstrap, or route orchestration.

## Changed Zone

Allowed areas:

- `packages/ui/**`
- `apps/lite/**`
- `apps/cloud-ui/**`
- minimal package/workspace wiring files if strictly required
- minimal docs sync if the extraction creates a durable shared package contract

Out of scope:

- moving discovery clients or data hooks into `packages/ui`
- moving runtime config into `packages/ui`
- moving page-level route orchestration into `packages/ui`
- renaming `apps/cloud`
- updating Cloud CD

## Extraction Boundary

Only extract presentation-first pieces such as:

- page shell
- section wrapper
- card container
- simple list row
- badge / status chip
- small typography wrappers if justified

Do not extract:

- fetch logic
- app-owned hooks
- discovery endpoint wiring
- route loaders
- settings capability logic

## Required Work

- create `packages/ui`
- move only the highest-confidence shared presentation components
- update Lite and Cloud UI call sites to use the shared package
- keep props explicit and app-agnostic
- avoid introducing a global dependency tangle

## Required Tests

1. extracted components render in both app contexts without networking assumptions
2. Lite and Cloud UI still build after adopting the shared components
3. no shared component imports app-owned discovery code

## Verification

1. `pnpm -C apps/lite typecheck`
2. `pnpm --filter @readio/cloud-ui build`
3. targeted tests for extracted components and touched app call sites

## Done When

- `packages/ui` exists and contains a small, justified set of presentation-only components
- both Lite and Cloud UI consume them without leaking networking logic into the shared package
- the extraction reduces duplication without overreaching

## Do Not Fold In

- Cloud API work
- large-scale Lite refactor
- runtime config consolidation
- Cloud CD updates
- directory rename to `apps/cloud-api`
