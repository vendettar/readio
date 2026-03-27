# Instruction 005: Cloud Networking Cutover [COMPLETED]

## Objective
Starting from the completed `003` bootstrap clone, migrate `apps/cloud-ui` away from Lite's browser-direct networking model and move Cloud networking ownership into `apps/cloud-api`.

At the end of this instruction family:

- `apps/cloud-ui` keeps the same frontend product experience as Lite
- `apps/cloud-ui` no longer depends on browser-direct Apple/feed networking for Cloud-specific discovery flows
- `apps/cloud-api` owns the Cloud networking boundary
- Cloud Settings removes the `CORS Proxy` block only after the backend migration is ready

## Parent Baseline
This instruction assumes `003-cloud-lite-full-clone-bootstrap.md` is already complete:

- `apps/cloud-ui` is a Lite-equivalent frontend clone
- `apps/cloud-api` serves the built Cloud frontend
- Cloud runs through Go on port `8080`

Do not re-open the clone/bootstrap work inside `005`.

## Core Rule
Do not redesign the frontend.

The frontend product contract remains:

- same shell
- same routes
- same page composition
- same command palette
- same local persistence model
- same player shell

The networking contract changes.

## Scope
Allowed areas across the `005` family:

- `apps/cloud-api/**`
- `apps/cloud-ui/**`
- minimal shared runtime contract files if strictly required
- minimal docs sync when the runtime contract becomes durable

Out of scope unless a child instruction explicitly allows it:

- redesigning pages
- changing Lite networking behavior
- broad shared-UI extraction
- Cloud-only branding or route divergence
- replacing local persistence with server persistence

## Execution Order
Implement in this order:

1. `005a-cloud-discovery-top-and-lookup.md`
2. `005b-cloud-search-cutover.md`
3. `005c-cloud-feed-cutover.md`
4. `005d-cloud-frontend-runtime-cutover.md`
5. `005e-cloud-docs-and-deploy-contract.md`
6. `005f-cloud-editors-picks-cutover.md`
7. `005g-cloud-feed-error-contract-cleanup.md`

Do not collapse these into a single mixed change.

## Cross-Cutting Requirements
Across all `005` child instructions:

- `apps/cloud-ui` must not import from `apps/lite`
- Cloud frontend UI must remain Lite-equivalent
- Cloud backend endpoints must return Cloud-owned JSON contracts
- browser-direct Apple/feed requests must be removed only when the equivalent backend path is ready
- tests must move with each cutover step

## Success Criteria
`005` is complete only when:

- top/lookup/search/feed flows used by Cloud are backend-owned
- the visible Explore Editor's Picks surface no longer depends on browser-direct Apple lookups
- Cloud frontend no longer needs the `CORS Proxy` settings block
- Cloud documentation and deploy/runtime contract match the new networking boundary
- malformed feed XML errors are mapped with XML-accurate backend error semantics
- verification commands across each child instruction are green

## Completion
- Completed by: Codex execution worker
- Reviewed by: Codex reviewer
- Commands: `go test ./...` in `apps/cloud-api`; `pnpm -C apps/cloud-ui build`; targeted `vitest` and `rg` verification during 005f/005g closure
- Date: 2026-03-27 18:31:54 CST
