# Instruction 007: Cloud ASR Fallback Cutover [COMPLETED]

## Parent Baseline
This instruction assumes the following are already complete:

- `003-cloud-lite-full-clone-bootstrap.md`
- `005-cloud-networking-cutover.md`
- `006-cloud-media-fallback-default-proxy.md`

Cloud already owns discovery/search/feed networking, and Cloud media fallback already exists for the approved request classes from `006`. This instruction closes the remaining Cloud-specific ASR networking gap.

## Objective
Remove the remaining Lite-style browser-direct CORS failure in Cloud ASR flows.

After this instruction:

- Cloud ASR-related remote requests no longer fail solely because the browser cannot access an upstream media/transcript host directly
- Cloud uses the existing `/api/proxy` fallback path for approved ASR-related remote requests
- Lite behavior remains unchanged
- Cloud UI remains Lite-equivalent in product behavior

## Problem Statement
In the current Cloud app, clicking playback for a single episode can still lead to a browser-side CORS failure during the ASR path after download/playback state transitions.

That means Cloud is still leaking a Lite-style browser networking constraint into a feature that should be backend-owned when direct browser access fails.

The goal is not to redesign ASR transport. The goal is to ensure that Cloud ASR no longer breaks on cross-origin/browser-networking failure classes that should already be covered by the Cloud fallback model.

## Scope
Allowed areas:

- `apps/cloud-ui/**`
- `apps/cloud-api/**` only if `/api/proxy` contract hardening is required for ASR parity
- minimal Cloud docs/handoff files if the runtime contract wording must be updated
- minimal tests needed to lock the ASR fallback behavior

Out of scope:

- Lite behavior changes
- ASR provider redesign
- backend ASR job orchestration
- server-side persistence of remote ASR payloads
- queue workers, Redis, object storage, or server-side media caches
- broad media fallback redesign already covered by `006`

## Core Rule
Reuse the existing `/api/proxy` route.

Do not introduce:

- a new ASR-specific proxy route
- a new media-specific backend service
- a separate Cloud-only ASR transport layer if the existing fallback contract can cover the need

## Required Work
### 1. Identify the failing Cloud ASR request classes
Audit the active Cloud ASR path and identify which remote requests can still fail browser-direct in Cloud.

At minimum verify these request classes:

- remote audio fetch used for ASR input
- remote transcript fetch used during ASR/transcript recovery flows
- any HEAD/GET/Range requests indirectly required before ASR starts
- any tracking-URL-unwrapped request path involved in ASR ingestion

Do not assume the failing request is only one URL. Verify the full active Cloud ASR chain.

### 2. Route approved ASR request classes through Cloud fallback on failure
For Cloud only:

- keep direct browser access as first choice where `006` still intends it
- when the approved ASR request class fails for browser/cross-origin/network reasons, retry through `/api/proxy`
- use explicit fallback classification, not a broad catch-all

If the current Cloud ASR path already declares fallback classes, finish the wiring instead of creating parallel logic.

### 3. Preserve terminal semantics
Do not turn every non-2xx into a fallback retry.

Maintain explicit behavior for terminal classes such as:

- invalid local blob state
- unsupported ASR provider configuration
- malformed transcript content
- true terminal upstream statuses where retrying through backend is not appropriate

Timeout, network, and approved browser-direct transport failures must be treated as fallback-eligible where Cloud intends backend ownership.

### 4. Preserve local-first behavior
The following must remain local/browser-owned and must not gain backend fallback just because they are adjacent to ASR:

- `blob:` playback
- IndexedDB/Dexie local audio reads
- downloaded local audio blob reads
- local subtitle artifact reads
- purely local player/session transitions

## Tests
Add or update the minimum tests required to lock the corrected ASR fallback behavior.

At minimum cover:

1. Cloud ASR remote audio fetch falls back to `/api/proxy` when direct browser fetch fails
2. Cloud ASR transcript fetch falls back to `/api/proxy` when direct browser fetch fails
3. direct success stays direct and does not unnecessarily proxy
4. local blob/local download ASR paths do not gain backend fallback
5. terminal non-fallback statuses still behave as terminal where intended

If the existing test harness can reproduce the current CORS-like failure using mocked `TypeError`/abort/network behavior, use that instead of inventing a broader fixture system.

## Verification
Run at minimum:

1. `pnpm -C apps/cloud-ui build`
2. `pnpm -C apps/cloud-ui test:run -- src/lib/__tests__/fetchUtils.test.ts src/lib/__tests__/audioPrefetch.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
3. any targeted ASR tests added or updated by this instruction
4. targeted search proving Cloud ASR fallback still reuses `/api/proxy` rather than a new route

## Done When
- Cloud ASR no longer hits a browser-side CORS failure for the approved fallback-eligible request class
- Cloud reuses `/api/proxy`
- Lite behavior is unchanged
- local-first behavior is preserved
- tests prove the corrected fallback behavior
- the branch is ready for review on the ASR changes zone

## Final Handoff Format
Return:

1. files changed
2. which ASR request classes were audited
3. which ASR request classes now fall back through `/api/proxy`
4. tests added/updated
5. verification command results
6. any residual ASR risks intentionally deferred

## Completion
- Completed by: Codex
- Reviewed by: Codex, Reviewer (independent 2026-03-31)
- Commands:
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/remoteTranscript.asr.test.ts` (9/9 PASS)
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/fetchUtils.test.ts src/lib/__tests__/audioPrefetch.test.ts src/lib/__tests__/remoteTranscript.asr.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `pnpm -C apps/cloud-ui build`
- Date: 2026-03-28
- Independent review addendum (2026-03-31): Added 3 missing test cases — local blob no-fallback, direct-stays-direct, TypeError fallback. All 6 instruction-required cases now covered.
