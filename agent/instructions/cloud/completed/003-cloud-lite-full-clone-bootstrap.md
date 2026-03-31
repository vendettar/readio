# Instruction 003: Cloud Lite Full Clone Bootstrap [COMPLETED]

## Objective
Create the first reliable Cloud bootstrap by making `apps/cloud-ui` a full copy-equivalent of `apps/lite`, then make `apps/cloud-api` serve that frontend and run the Cloud app on port `8080`.

This instruction is intentionally conservative.

It does **not** try to make Cloud smarter yet.
It does **not** try to remove browser-direct networking yet.
It does **not** try to redesign or partially recompose Lite into Cloud.

The immediate goal is:

- `apps/cloud-ui` must become a true Lite-equivalent frontend
- Cloud must run through a Go backend entrypoint on `8080`
- frontend parity is more important than elegance in this phase

## Product Rule
For this bootstrap phase, treat Cloud as a deployment wrapper around the Lite frontend product.

That means:

- `apps/cloud-ui` should be the same frontend product as `apps/lite`
- same routes
- same pages
- same UI
- same settings
- same command palette
- same persistence assumptions
- same local behavior

Do **not** remove the `CORS Proxy` settings block in this instruction.

Reason:
- this phase exists to establish a guaranteed identical baseline
- Cloud-specific frontend divergence comes later

If the frontend is not functionally identical to Lite after this instruction, the instruction is incomplete.

## Core Strategy
Do not continue with incremental parity work.

Do this instead:

1. copy the Lite frontend product into `apps/cloud-ui`
2. make the copied frontend build and run there
3. only make the minimum path/package/import changes required for it to live under `apps/cloud-ui`
4. make `apps/cloud-api` serve the built `apps/cloud-ui` artifact
5. keep backend logic minimal in this phase

This is a bootstrap clone instruction, not a shared-extraction instruction.

## Scope
Allowed areas:

- `apps/lite/**`
- `apps/cloud-ui/**`
- `apps/cloud-api/**`
- root/package wiring only if required to make the clone build
- minimal test/build script wiring only if required

Out of scope:

- removing Lite browser-direct networking
- replacing frontend discovery/search/feed code with Cloud backend adapters
- removing `CORS Proxy` UI
- major refactors into `packages/ui`
- design cleanup
- documentation cleanup beyond minimal changes required to explain the bootstrap
- deployment/CD redesign beyond what is minimally required to run the app through Go on `8080`

## Required Outcome
After this instruction:

- `apps/cloud-ui` is effectively a relocated Lite frontend
- `apps/cloud-api` is the runtime entrypoint
- `apps/cloud-api` serves the Cloud frontend static build
- the Cloud app is reachable through the Go service on port `8080`

This bootstrap is allowed to keep Lite networking behavior for now.

## Required Work

### Phase 1: Clone Lite Frontend into Cloud UI
Use `apps/lite` as the source of truth.

Required rules:

- copy the frontend product code from `apps/lite` into `apps/cloud-ui`
- preserve route structure
- preserve page behavior
- preserve settings behavior
- preserve local persistence behavior
- preserve command palette and local app affordances
- preserve player shell and visible playback UI

Do not:

- rewrite the pages by hand
- replace pages with placeholders
- drop features because they are inconvenient to port
- decide on your own that a Lite feature is unnecessary in Cloud

### Phase 2: Make the Copied Frontend Build in `apps/cloud-ui`
Adjust only what is necessary so the cloned frontend can build from the new app location.

Examples of allowed changes:

- import path fixes
- package dependency additions
- Vite/Tailwind/config adjustments
- app entrypoint updates
- package name/script updates

Examples of disallowed changes:

- replacing real Lite features with mock data surfaces
- deleting frontend capabilities to reduce porting effort
- redesigning routes or shell structure

### Phase 3: Minimal Cloud API Bootstrap
In `apps/cloud-api`, implement only the minimum Go runtime needed to host the frontend.

Required behavior:

- start an HTTP server on port `8080`
- provide a health endpoint such as `/healthz`
- serve static files from the built `apps/cloud-ui` output
- serve the frontend app shell for browser navigation routes

This phase is intentionally minimal.

Do not:

- implement full discovery/search/feed proxy behavior yet
- add speculative backend features
- rebuild Lite networking contracts in Go during this step

### Phase 4: Running Contract
The expected local/runtime contract for this bootstrap is:

- build `apps/cloud-ui`
- start `apps/cloud-api`
- access the Cloud app via the Go server on `8080`

The frontend should render as a Lite-equivalent app through the Go-hosted origin.

## Explicit Non-Goals
This instruction must **not** be interpreted as:

- "start extracting shared primitives first"
- "make Cloud approximately match Lite"
- "remove `CORS Proxy` now"
- "replace local persistence with server persistence now"
- "introduce a new Cloud-specific shell now"

Those are later-phase concerns.

## Review Standard
This instruction fails if any of the following are true:

- `apps/cloud-ui` is still missing Lite pages or behaviors
- `apps/cloud-ui` still contains placeholder replacements for Lite surfaces
- the command palette is missing
- IndexedDB/Dexie-backed frontend behavior was dropped without explicit approval
- the settings page differs from Lite
- the route surface differs from Lite
- the app is not served through Go on port `8080`

## Verification
Run all of these:

1. `pnpm --filter @readio/cloud-ui build`
2. any targeted `apps/cloud-ui` tests needed to prove the cloned app renders
3. `go test ./...` in `apps/cloud-api`
4. run the Go server locally
5. verify `http://127.0.0.1:8080/healthz`
6. verify the frontend app is served from the Go server on `http://127.0.0.1:8080`

## Done When
- `apps/cloud-ui` is a Lite-equivalent frontend clone
- `apps/cloud-api` serves the built frontend
- Cloud runs through the Go service on `8080`
- no feature-dropping or placeholder substitutions were used to make the clone easier

## Do Not Fold In
- Cloud-specific UI divergence
- same-origin backend API migration
- settings cleanup
- CORS proxy removal
- shared UI extraction cleanup
- broad doc reorganization

## Follow-Up Note
Only after this bootstrap clone is complete should later instructions begin to:

- remove Cloud-inapplicable frontend settings such as `CORS Proxy`
- move browser-direct networking to Go-backed endpoints
- extract clean shared frontend layers

In other words:

- first establish a true Lite-equivalent Cloud baseline
- then specialize Cloud in controlled follow-up instructions

## Completion
- Completed by: Codex
- Reviewed by: Codex
- Commands:
  - `pnpm --filter @readio/cloud-ui build`
  - `pnpm --filter @readio/cloud-ui exec vitest run src/components/GlobalSearch/__tests__/CommandPalette.test.tsx src/components/Settings/__tests__/CorsProxySettingsSection.test.tsx`
  - `go test ./...`
  - `go run .`
  - `curl -i http://127.0.0.1:8080/healthz`
  - `curl -i http://127.0.0.1:8080/`
- Date: 2026-03-26
