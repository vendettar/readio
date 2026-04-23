# Instruction 008: Cloud ASR Provider Relay Cutover [COMPLETED]

## Parent Baseline
This instruction assumes the following are already complete:

- `003-cloud-lite-full-clone-bootstrap.md`
- `005-cloud-networking-cutover.md`
- `006-cloud-media-fallback-default-proxy.md`
- `007-cloud-asr-fallback-cutover.md`

`007` proved that Cloud already covers ASR-adjacent media fetch fallback for:

- remote audio fetch used as ASR input
- remote transcript fetch used during transcript recovery

It did **not** move ASR provider API calls out of the browser.

## Objective
Remove the remaining browser-direct CORS failure in Cloud ASR by moving ASR provider transcription requests behind the Cloud backend.

After this instruction:

- Cloud no longer sends Groq / Deepgram / Qwen / Volcengine transcription requests directly from the browser
- Cloud UI submits ASR work to a same-origin Cloud backend relay
- Cloud backend performs the provider request and returns the normalized transcription result
- provider credentials remain user-owned and browser-supplied in this phase unless a later instruction explicitly changes the secret model
- Lite behavior remains unchanged
- Cloud UI remains Lite-equivalent in product behavior

## Problem Statement
Cloud currently still leaks Lite-style browser networking in one critical ASR segment:

- the media input fetch can fall back through `/api/proxy`
- but the actual ASR provider transcription request is still browser-direct

That means Cloud can still fail with browser CORS errors against provider endpoints such as:

- `https://api.groq.com/openai/v1/audio/transcriptions`

This is not a `/api/proxy` gap anymore. It is a provider-transport ownership gap.

In this phase, the intended cutover is:

- backend-owned same-origin transport
- client-owned provider credential

This instruction does **not** introduce server-side ownership or persistence of user ASR API keys.

## Core Rule
Do **not** extend `/api/proxy` into a generic multipart/provider relay.

`/api/proxy` is currently a bounded GET/HEAD-oriented fetch proxy. This instruction must not mutate it into a broad POST body tunneling surface for third-party API calls.

Instead:

- add a dedicated Cloud ASR relay endpoint under the existing Cloud API namespace
- keep the relay narrow and provider-specific
- do not expose a generic arbitrary upstream POST proxy

## Scope
Allowed areas:

- `apps/cloud-api/**`
- `apps/cloud-ui/**`
- minimal Cloud docs/handoff/runtime contract files if the ASR transport contract becomes durable

Out of scope:

- Lite behavior changes
- backend ASR queue workers
- server-side persistence of uploaded audio
- object storage / Redis / media caches
- redesigning the ASR provider abstraction beyond what relay transport requires
- broad `/api/proxy` redesign
- user accounts / server-side transcript ownership

## Required 8-Scope Scan
Before implementation, produce a short scan covering:

- config
- persistence
- routing
- logging
- network
- storage
- UI state
- tests

Also explicitly scan:

- request body size limits
- duplicate submission / retry storms
- stale completion after track switch
- provider secret exposure
- large-blob memory pressure on both client and server

## Required Work
### 1. Audit the current Cloud ASR provider transport
Verify the active Cloud ASR provider request path end-to-end.

At minimum confirm:

- which provider endpoints are still browser-direct
- how provider selection/model selection is resolved
- which payload shape each provider requires
- which existing result normalization paths must remain unchanged
- which browser-local audio sources are converted to blobs before provider submission

The audit must explicitly distinguish:

- media fetch fallback
- provider API submission

Do not treat them as the same networking layer.

### 2. Add a narrow backend relay endpoint
Implement a Cloud backend endpoint for ASR provider submission.

Requirements:

- route lives under the existing Cloud API namespace, not `/api/proxy`
- accepts only the fields needed for Cloud transcription
- validates provider id and model selection
- rejects unsupported providers cleanly
- enforces a bounded request body size
- accepts browser-supplied provider credentials for this phase if the product contract still requires user-provided keys
- must treat browser-supplied credentials as transient request data only
- must not persist, cache, or log browser-supplied credentials
- preserves the current normalized transcription response shape expected by `apps/cloud-ui`
- maps provider statuses into stable backend error semantics

Do not implement:

- generic arbitrary upstream URL forwarding
- provider verification redesign
- persisted upload storage
- background jobs

### 3. Cut Cloud UI over to the relay
For Cloud only:

- keep the existing browser/local audio blob preparation flow
- replace browser-direct provider `fetch(...)` with submission to the Cloud relay
- preserve existing cancellation semantics where feasible
- preserve cooldown / retry policy semantics already implemented in the ASR client flow
- preserve local blob/local download behavior as input sources

Do not:

- change Lite provider transport
- route Cloud provider calls back through `/api/proxy`
- duplicate provider result parsing logic unnecessarily across frontend and backend without justification

### 4. Preserve terminal semantics
The relay must not blur client/config/provider failures together.

Keep explicit behavior for at least:

- missing provider configuration
- unsupported provider/model
- unauthorized provider credential
- payload too large
- upstream rate limit
- upstream 5xx
- client abort / stale track switch

### 5. Synchronize docs only if the runtime contract becomes durable
If this instruction changes the durable Cloud contract, update the task-relevant docs/handoff files in the same task.

Docs must say:

- Cloud ASR provider submission is same-origin backend-relayed
- provider credentials remain user-owned and browser-supplied in this phase
- Cloud still keeps browser-local blobs/downloads as local inputs
- Cloud media fallback and Cloud ASR provider relay are separate mechanisms

Docs must not say:

- all media now goes through the backend
- `/api/proxy` handles ASR provider transcription
- Cloud owns or stores user ASR provider keys unless a later instruction explicitly adds that capability

## Execution Order
Implement in this order:

1. `008a-cloud-asr-provider-transport-audit.md`
2. `008b-cloud-asr-backend-relay-contract.md`
3. `008c-cloud-asr-client-relay-cutover.md`
4. `008d-cloud-asr-relay-regression-coverage.md`
5. `008e-cloud-asr-docs-and-runtime-contract.md`

Do not collapse these into one mixed patch.

## Child Instruction Intent
### `008a-cloud-asr-provider-transport-audit.md`
Audit the current Cloud ASR transport split:

- media-source fetch behavior
- provider API submission behavior
- local blob/downloaded blob submission paths
- provider/model selection and current normalization boundaries

This audit must leave a written record of which Cloud ASR request classes are already backend-owned and which remain browser-direct.

### `008b-cloud-asr-backend-relay-contract.md`
Implement the same-origin ASR relay surface:

- narrow same-origin API route
- explicit provider allowlist
- bounded request body size
- stable provider error mapping
- no generic passthrough proxy behavior
- transient handling of browser-supplied credentials only

### `008c-cloud-asr-client-relay-cutover.md`
Switch Cloud UI provider submission to the backend relay:

- Cloud-only cutover
- preserve current blob preparation and cooldown/retry behavior
- preserve abort/stale-request handling
- keep Lite unchanged

### `008d-cloud-asr-relay-regression-coverage.md`
Add deterministic coverage proving:

- Cloud browser path no longer directly calls provider transcription endpoints
- relay success preserves normalized transcription contract
- unauthorized / rate-limited / 5xx semantics remain correct
- stale completions do not override the active track

### `008e-cloud-asr-docs-and-runtime-contract.md`
Synchronize docs and lifecycle if the relay becomes the durable Cloud ASR contract:

- Cloud docs
- handoff docs
- roadmap state
- decision log

## Required Patterns
- narrow dedicated ASR relay endpoint
- explicit provider allowlist
- explicit request schema validation
- bounded upload size
- deterministic error mapping
- no persistence/logging of browser-supplied provider credentials
- Cloud-only frontend cutover branch
- cancellation-safe async handling

## Forbidden Dependencies
- Redis
- object storage
- background workers
- new backend framework
- generic multipart passthrough proxying
- Lite-to-Cloud cross-imports

## Tests
Add the minimum tests needed to prove the relay cutover.

At minimum cover:

## Completion
- Completed by: Codex
- Reviewed by: Codex
- Commands:
  - `go test ./...`
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/asr/__tests__/backendRelay.test.ts src/lib/__tests__/remoteTranscript.asr.test.ts src/lib/__tests__/remoteTranscript.localInputRelay.test.ts src/lib/asr/__tests__/index.deepgram-routing.test.ts src/lib/asr/__tests__/index.providerToggleGuard.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `pnpm -C apps/cloud-ui build`
  - `git diff --check`
- Date: 2026-03-29

1. Cloud no longer calls provider transcription endpoints directly from the browser path
2. Cloud submits transcription to the backend relay instead
3. successful relay response preserves the existing transcription result contract
4. provider unauthorized / rate-limited / 5xx errors map to expected client-visible ASR error classes
5. local blob / downloaded blob inputs still work as ASR sources
6. stale track switch / abort does not let an old relay result overwrite the current track

At least one test must explicitly prove:

- browser fetch target is same-origin Cloud API
- not `https://api.groq.com/...` or another direct provider endpoint

Do not rely only on manual runtime observation.

## Verification
Run at minimum:

1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted Cloud ASR tests added/updated by this instruction
4. targeted search proving Cloud provider submission no longer uses browser-direct provider endpoints in the Cloud path
5. manual Cloud runtime verification through `http://localhost:8080`

## Decision Log
- Required

Record the decision that Cloud ASR provider submission uses a dedicated backend relay instead of broadening `/api/proxy`, including:

- option comparison
- rationale
- risks

## Bilingual Sync
- Required if Cloud docs or roadmap files are touched

## Done When
- Cloud ASR provider transcription requests are same-origin backend-relayed
- browser-side Cloud ASR no longer directly calls provider transcription endpoints
- Lite behavior is unchanged
- local-first audio/blob assumptions are preserved
- user-provided ASR keys remain transient request inputs rather than persisted server-side state
- tests prove same-origin relay ownership and error semantics
- docs/runtime contract are synchronized if changed
- branch is ready for review on the ASR relay changes zone

## Final Handoff Format
Return:

1. files changed
2. audited provider request classes
3. new backend relay route and contract summary
4. frontend call sites cut over to the relay
5. tests added/updated
6. verification command results
7. residual risks intentionally deferred
