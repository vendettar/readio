# Cloud Runtime Config Ownership Cutover [COMPLETED]

## Goal

Move `apps/cloud-ui` away from Lite's front-end-heavy runtime config model and establish a Cloud-specific config ownership model:

- server-owned config lives in `apps/cloud-api` runtime environment
- browser-public runtime config is emitted by `apps/cloud-api` as `/env.js`
- browser-local/user-local config stays in browser storage/runtime
- `apps/cloud-ui/public/env.js` becomes dev/default-template only, not the production source of truth

This instruction exists because Cloud is no longer a browser-direct Lite app clone. It is now a backend-owned product surface with same-origin API/runtime boundaries. The runtime config model must reflect that.

## Problem Statement

The current Cloud app still inherits Lite's assumption that most runtime config originates from front-end static files:

- `apps/cloud-ui/public/env.js`
- `apps/cloud-ui/public/env.local.js`

That is no longer the right ownership model for Cloud because:

1. Cloud now owns networking on the backend.
2. Cloud now owns service-side abuse controls and relay boundaries.
3. Some runtime values must be shared by backend and frontend, but their source of truth should remain server-owned.
4. Production config should not require manually editing static front-end assets on the VPS.

The ASR relay token issue exposed the broader problem, but the fix must address config ownership as a whole, not only one field.

## Scope

This instruction should cover:

1. classify Cloud runtime config into ownership buckets
2. move server-owned fields behind backend runtime env
3. make `apps/cloud-api` serve production `/env.js` dynamically
4. keep `apps/cloud-ui/public/env.js` as dev/default-template only
5. document the new contract clearly

Do not mix this with unrelated UI, ASR provider, media fallback, or discovery feature work.

## Execution Order

Implement in this order:

1. `009a-cloud-runtime-config-code-and-tests.md`
2. `009b-cloud-runtime-config-docs-and-lifecycle.md`

Do not collapse this into one mixed patch.

## Ownership Model

### 1. Server-owned config

These values belong to backend runtime environment and must not be front-end-authored in production:

- service listen/runtime path values
- same-origin backend routing roots
- relay abuse-control settings
- backend fallback policy knobs
- database/runtime infra settings
- server-owned feature toggles

Examples already in or adjacent to this class:

- `PORT`
- `READIO_CLOUD_UI_DIST_DIR`
- `READIO_CLOUD_DB_PATH`
- `READIO_ASR_ALLOWED_ORIGINS`
- `READIO_ASR_RELAY_TOKEN`
- `READIO_ASR_RATE_LIMIT_BURST`
- `READIO_ASR_RATE_LIMIT_WINDOW_MS`

### 2. Browser-public runtime config

These values are allowed to be visible to the browser, but in Cloud production they should be sourced from backend-generated `/env.js`, not from static front-end assets.

Examples:

- app name/version
- same-origin discovery/feed/search URLs
- browser-safe ASR relay token
- browser-visible feature toggles
- UI defaults that should vary by deployment environment

Important: "browser-public" does not mean "secret". If a value is emitted into `/env.js`, assume every browser user can read it.

### 3. Browser-local config/state

These remain browser-owned and should not be migrated to backend runtime env:

- IndexedDB/Dexie local persistence
- user-entered provider API keys
- cache sizing behavior that is purely local
- playback/session state
- local download/transcript state
- browser interaction preferences

## Required Architecture

### Production

In production Cloud:

- `/env.js` must be served by `apps/cloud-api`
- the handler must build `window.__READIO_ENV__` from backend runtime env plus stable defaults
- the production browser must not depend on `dist/env.js` as the source of truth

### Development

For front-end-only development:

- `apps/cloud-ui/public/env.js` remains valid
- `apps/cloud-ui/public/env.local.js` remains valid
- local dev should continue to work without requiring the Go server to generate `/env.js`

### Contract Rule

Do **not** make Go parse `apps/cloud-ui/public/env.js` or any other front-end JS file to derive runtime values.

Go must instead:

- own an explicit browser-safe allowlist of config fields
- use explicit defaults
- read backend env directly
- emit `/env.js` deterministically

The front-end static `env.js` is a dev/default template, not a machine-readable production config source.

## Required Implementation Tasks

### 1. Audit current Cloud runtime config surface

Inventory the runtime config fields currently used by Cloud and classify each as:

- server-owned
- browser-public runtime
- browser-local only

This audit must be explicit, not implied.

### 2. Introduce backend-generated `/env.js`

`apps/cloud-api` must add a dedicated handler for `/env.js` that:

- responds with JavaScript
- sets `window.__READIO_ENV__ = { ... }`
- includes only browser-safe fields
- is registered before the SPA/static fallback

### 3. Preserve dev behavior

Do not break:

- `apps/cloud-ui` local dev server
- `public/env.js`
- `public/env.local.js`

But make it clear in code and docs that these files are dev/default-template paths, not production Cloud truth.

### 4. Move production-owned fields off static front-end config

At minimum, production Cloud must stop treating these as front-end-authored config:

- `READIO_ASR_RELAY_TOKEN`
- same-origin backend-owned URL roots when generated by server
- any server abuse-control or transport boundary values

### 5. Keep browser-facing contract stable where practical

`apps/cloud-ui/src/lib/runtimeConfig.ts` should continue to read `window.__READIO_ENV__`.

Do not force broad front-end rewrites if the runtime config consumption contract can remain stable.

## Child Instruction Intent

### `009a-cloud-runtime-config-code-and-tests.md`

Handle the code-and-test portion only:

- runtime config ownership audit artifact
- backend-generated `/env.js`
- explicit browser-safe allowlist
- Cloud UI runtime contract staying on `window.__READIO_ENV__`
- focused Go/Vitest/build/manual verification

Do not update roadmap or close the parent instruction here.

### `009b-cloud-runtime-config-docs-and-lifecycle.md`

Handle the docs-and-lifecycle portion only, after `009a` is approved:

- Cloud docs and handoff sync, including zh counterparts
- decision log entry for the production Cloud `/env.js` ownership model
- parent/child instruction completion lifecycle
- roadmap sync after reviewer approval

Do not reopen code scope here unless reviewer finds a concrete mismatch with `009a`.

## Out of Scope

Do not:

- redesign Lite config ownership
- convert Lite to backend-generated `/env.js`
- redesign all front-end settings storage
- implement auth/accounts/session systems
- introduce strong secret guarantees for browser-visible fields
- use this instruction to move user API keys to the backend

## Security / Behavior Constraints

1. If a field is emitted to browser `/env.js`, treat it as publicly visible.
2. Do not expose backend-only infrastructure fields in browser runtime config.
3. Do not let backend-generated `/env.js` become an unbounded dump of process environment.
4. Only emit an explicit allowlist of browser-safe fields.
5. Keep `READIO_ASR_RELAY_TOKEN` understood as a lightweight abuse-control token, not a true secret boundary.

## Testing Requirements

At minimum add/adjust tests proving:

1. `apps/cloud-api` serves `/env.js` before SPA fallback
2. production `/env.js` contains expected browser-safe fields
3. production `/env.js` does not expose backend-only fields
4. Cloud front-end still reads `window.__READIO_ENV__` correctly
5. Cloud local dev still works with static `public/env.js`
6. the ASR relay token path still works under backend-generated runtime env

## Documentation Requirements

Update Cloud docs/handoff to state:

- production Cloud `/env.js` is backend-generated
- `public/env.js` is dev/default-template oriented
- server-owned runtime config belongs in VPS env/systemd env file
- browser-public runtime config is emitted by backend

## Verification

Run at minimum:

1. targeted `apps/cloud-ui` changed-zone tests:
   - `pnpm -C apps/cloud-ui test:run -- src/lib/__tests__/cloudRuntimeDefaultsContract.test.ts`
   - `pnpm -C apps/cloud-ui test:run -- src/lib/__tests__/runtimeConfig.schema-parity.test.ts`
   - `pnpm -C apps/cloud-ui test:run -- src/lib/asr/__tests__/backendRelay.test.ts`
2. targeted `apps/cloud-api` tests covering `/env.js` ownership cutover behavior
3. `pnpm -C apps/cloud-ui build`
4. `go test ./...` in `apps/cloud-api`
5. if this instruction changes broader runtime-config wiring beyond the targeted files, run the minimum additional focused tests for only those touched areas instead of relying on a blanket full-suite pass
6. local manual verification:
   - `http://localhost:8080/env.js`
   - Cloud UI loads
   - ASR relay still works

## Done When

- Cloud production `/env.js` is generated by `apps/cloud-api`
- Cloud production no longer depends on static `dist/env.js` as runtime truth
- server-owned values are owned by backend runtime env
- browser-public values are emitted via explicit allowlist
- dev static `public/env.js` still works
- docs describe the new ownership model clearly

## Completion

Completed by: Worker
Reviewed by: Top
Date: 2026-03-31

Commands run:
- Documentation sync: Updated Cloud README.mdx, deployment.mdx with runtime config ownership sections
- Documentation sync: Updated handoff/index.mdx with Section 8 Runtime Config Ownership Audit reference
- Documentation sync: Added decision-log entry D118 for production /env.js ownership model
- Instruction lifecycle: Marked 009b [COMPLETED]
