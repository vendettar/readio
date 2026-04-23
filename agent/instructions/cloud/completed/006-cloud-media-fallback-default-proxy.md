# Instruction 006: Cloud Media Fallback Default Proxy [COMPLETED]

## Objective
Remove the remaining Lite-style uncertainty in Cloud media access without forcing all media traffic through the backend.

Cloud media behavior should become:

- browser-direct first, matching Lite's low-cost path when the upstream media host allows it
- automatic fallback to `apps/cloud-api` only when direct browser access fails for Cloud-relevant cross-origin reasons
- no required user-configured CORS proxy in Cloud
- no server-side persistence or server-side cache for media payloads

This instruction family treats `apps/cloud-api` as Cloud's built-in default media fallback proxy, not as a permanent mandatory media transport for every request.

## Parent Baseline
This instruction assumes the following are already complete:

- `003-cloud-lite-full-clone-bootstrap.md`
- `005-cloud-networking-cutover.md`

Cloud already owns discovery/search/feed networking. This instruction covers the remaining media layer behavior: audio media, audio-adjacent fetches, and browser-side fallbacks that still vary by upstream host.

## Problem Statement
Cloud currently removes the need for a user-configured CORS proxy for discovery/search/feed, but media access still retains Lite's source-dependent uncertainty:

- some episode audio URLs are playable browser-direct
- some redirected audio hosts reject JS fetches due to missing CORS headers
- some media-adjacent requests succeed while others fail for the same episode
- user experience still depends on the final upstream host and request type

The target is not "proxy all audio". The target is:

- preserve direct browser playback whenever it already works
- use the Cloud backend as the default fallback path when browser media fetches fail for cross-origin reasons

## Core Product Rule
Do not turn Cloud into a mandatory media relay by default.

Cloud media policy after this instruction family:

1. Try the Lite-equivalent browser-direct path first.
2. If the direct path succeeds, keep it.
3. If the direct path fails for cross-origin / browser-networking reasons, retry through `apps/cloud-api`.

This applies to Cloud only. Do not change Lite behavior in this instruction family.

This is a deliberate cost/bandwidth tradeoff, not an architectural truth.
For this phase, Cloud prefers:

- lower backend bandwidth
- preserving the Lite-equivalent direct path when it already works

over:

- absolute transport determinism for every media host

If later product priorities move toward stronger determinism and simpler runtime behavior, Cloud may legitimately switch to broader backend-owned media transport for selected request classes. `006` does not pre-decide that future direction.

## Non-Goals
Out of scope for `006`:

- redesigning the player UI
- replacing browser media playback with server-owned persistent streaming
- adding service-side media caching
- changing Lite product behavior
- introducing user accounts or server-side playback state
- building a media CDN
- adding DRM, tokenized signed URLs, or multi-tenant media controls

## Required Architecture Constraints
The implementation must preserve these constraints:

- `apps/cloud-ui` remains Lite-equivalent in UI and route structure
- browser-direct media remains the first-choice path
- `apps/cloud-api` becomes the built-in Cloud fallback proxy for media fetches that need it
- backend media proxying is pass-through only for this phase
- no backend media persistence, no disk cache, no object storage
- no change to the existing browser-local download/storage model
- clearing browser site data must still remove local downloads/transcripts/settings exactly as today
- `Range` and seek semantics must remain compatible with the current Lite player behavior
- fallback logic must be narrow and explicit, not "route every media request through backend just in case"

The existing Cloud proxy surface to reuse in this instruction family is:

- `/api/proxy`

Do not introduce a separate media-specific proxy route in `006` unless a later architecture instruction explicitly replaces `/api/proxy`.

The following request classes must remain browser-only and must not gain backend fallback in `006`:

- local `blob:` playback
- IndexedDB/Dexie-backed local media reads
- local subtitle artifact reads
- local file ingestion and local object URL playback
- purely local player state transitions with no network request

Native media-element requests and JS `fetch` requests are separate request classes.
Do not treat:

- `<audio src=...>`

as equivalent to:

- JS `fetch`
- `HEAD`
- `GET`
- `Range GET`

If native `<audio>` fallback is implemented at all, it must use an explicit proxied media URL strategy and an explicit player-state design. It must not be smuggled in as a generic fetch retry abstraction.

## Scope
Allowed areas across the `006` family:

- `apps/cloud-api/**`
- `apps/cloud-ui/**`
- minimal Cloud docs/runtime contract files

Out of scope unless a child instruction explicitly allows it:

- `apps/lite/**`
- shared architectural rewrites unrelated to media fallback
- deployment redesign beyond what the media fallback contract requires

## 8-Scope Scan Requirements
Every child instruction under `006` must include a short scan across:

- config
- persistence
- routing
- logging
- network
- storage
- UI state
- tests

If any child instruction touches async media state, it must also explicitly scan for:

- duplicate retries
- playback re-entrancy
- seek regressions
- stalled pending states
- excessive parallel prefetch/download work

## Decision
Use `apps/cloud-api` as the Cloud default fallback proxy for media-related requests that fail browser-direct due to cross-origin/browser fetch constraints.

### Rationale
- preserves the low-cost direct path when upstream media hosts already work in the browser
- removes the need for users to configure a separate proxy for Cloud
- keeps Cloud aligned with Lite's local-first storage model
- avoids prematurely forcing all media bytes through the backend
- limits backend scope to fallback ownership instead of full media distribution ownership

### Risks
- media fallback detection can be over-broad and accidentally proxy traffic that would have worked directly
- `Range` / partial-content forwarding can break seek if the backend contract is incomplete
- browser playback, prefetch, download, and transcript ingestion do not all fail in the same way; fallback triggers must be request-type aware
- backend relay of large media responses still increases bandwidth and concurrency pressure when fallback is active
- some upstream failures are not CORS failures and should not be retried blindly

## Execution Order
Implement in this order:

1. `006a-cloud-media-surface-audit.md`
2. `006b-cloud-media-fallback-proxy-contract.md`
3. `006c-cloud-media-client-fallback-routing.md`
4. `006d-cloud-media-range-seek-regression-coverage.md`
5. `006e-cloud-media-docs-and-runtime-contract.md`

Do not collapse these into one mixed patch.

## Child Instruction Intent
### `006a-cloud-media-surface-audit.md`
Map every Cloud media-relevant request type and classify:

- direct-only
- direct with existing fallback
- direct without fallback
- should gain backend fallback
- must remain browser-only

This audit must cover at minimum:

- primary audio playback source resolution
- foreground audio prefetch
- download HEAD sizing
- download GET streaming
- remote transcript fetch
- any media fetches triggered during playback startup

### `006b-cloud-media-fallback-proxy-contract.md`
Add or harden backend endpoints/handlers required for media fallback.

Required contract:

- pass-through proxy behavior only
- bounded timeouts
- strict target validation
- explicit support for forwarding request method and required headers
- correct forwarding of `Range`-related request/response behavior where needed
- explicit handling for redirect chains
- no server-side media caching or persistence

### `006c-cloud-media-client-fallback-routing.md`
In `apps/cloud-ui`, route only the necessary media-adjacent requests through the Cloud backend on failure.

Requirements:

- direct browser path remains first
- fallback is triggered only for request classes that actually need it
- avoid infinite retry loops
- avoid converting successful direct browser playback into forced backend transport
- preserve current local download/blob playback behavior

### `006d-cloud-media-range-seek-regression-coverage.md`
Add targeted tests proving:

- direct path is still preferred when it works
- fallback activates on cross-origin/browser fetch failure
- proxied range requests preserve seek behavior
- download/transcript flows do not regress
- player state transitions remain recoverable after failed direct attempts

### `006e-cloud-media-docs-and-runtime-contract.md`
Update Cloud docs and handoff to reflect:

- Cloud no longer requires a user-configured CORS proxy for supported media fallback paths
- backend media fallback is pass-through and non-caching
- browser-local persistence remains the source of truth for local media artifacts
- operational expectations for fallback-related backend traffic

## Forbidden Dependencies
Child instructions must not introduce:

- Redis
- object storage
- server-side media databases
- background media sync workers
- new frontend networking libraries
- Lite-to-Cloud cross-imports

## Required Patterns
Child instructions should prefer:

- narrow request-type-specific fallback logic
- explicit error classification before backend retry
- backend validation before upstream media fetch
- clear timeout and partial-content handling
- tests that distinguish playback, prefetch, download, and transcript flows
- bounded in-memory host/request-class fallback memoization where repeated direct failures would otherwise cause avoidable retry churn

## Success Criteria
`006` is complete only when:

- Cloud users no longer need a separately configured CORS proxy for supported media fallback paths
- direct browser media access remains the first-choice path
- Cloud backend fallback activates only when direct media access fails for supported browser/cross-origin reasons
- seek and range behavior remain compatible with current Lite expectations
- no backend media persistence or caching is introduced
- Cloud docs and runtime contract accurately describe the fallback-first architecture

## Completion
- Completed by: Codex
- Reviewed by: Codex reviewer
- Commands:
  - `pnpm -C apps/cloud-ui build`
  - `go test ./...` in `apps/cloud-api`
  - `git diff --check`
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/fetchUtils.test.ts src/lib/__tests__/audioPrefetch.test.ts src/lib/__tests__/remoteTranscriptCache.test.ts src/lib/__tests__/playbackSource.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `curl -i http://localhost:8080/healthz`
  - `curl -I http://localhost:8080/`
- Date: 2026-03-28

## Verification Baseline
Each child instruction must declare its own scoped verification.

At the parent level, final closure should include at minimum:

1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted Vitest coverage for playback/prefetch/download/transcript fallback behavior
4. manual runtime verification on Cloud through `http://localhost:8080`

## Done When
- media fallback ownership is explicit and backend-backed for Cloud
- Cloud preserves direct media access whenever available
- Cloud no longer depends on user-supplied proxy configuration for the supported media cases covered by this instruction family
- docs, tests, and runtime contract all match the implemented behavior
