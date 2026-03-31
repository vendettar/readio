# Instruction 006c: Cloud Media Client Fallback Routing [COMPLETED]

## Parent
- `006-cloud-media-fallback-default-proxy.md`
- `006a-cloud-media-surface-audit.md`
- `006b-cloud-media-fallback-proxy-contract.md`

## Objective
Teach `apps/cloud-ui` to retry only the necessary media-related request classes through the Cloud backend when the browser-direct path fails.

This instruction is frontend/runtime-only. It must use the audit from `006a` and the backend contract from `006b`.

## Goal
After this instruction:

- direct browser media access remains first-choice
- Cloud backend fallback is used only where required
- the client does not over-proxy media requests that already work browser-direct
- Lite behavior remains unchanged

## Frontend Work
In `apps/cloud-ui`, implement request-type-specific fallback behavior for only the classes approved by `006a`.

Candidate areas likely to change include:

- media fetch helpers used by download/transcript flows
- foreground audio prefetch behavior
- any Cloud-specific playback startup path that performs JS media fetches

Do not assume that primary native audio playback should be rewritten into a JS fetch path. If the chosen solution touches native playback fallback, the topology and player-state implications must be documented explicitly.

## Required Behavior
- browser-direct path is attempted first
- fallback triggers only on approved browser/cross-origin failure classes
- no infinite retry loops
- no fallback recursion through a backend URL that itself re-enters the same client fallback logic
- no regression to local `blob:` playback
- no regression to existing tracking-URL unwrap behavior where still applicable
- no broad "always proxy this request class forever" shortcut unless `006a` explicitly approves it

## Required Trigger Discipline
The client must not treat every playback failure as a backend-fallback candidate.

At minimum, the implementation must distinguish:

- direct browser network/CORS-style failure
- upstream 4xx/5xx that should not be blindly retried
- aborted requests caused by source switch
- stale async completion after track change
- unsupported request type for backend fallback

If a request class cannot be safely retried, leave it browser-only and document the reason.

The implementation should add a bounded in-memory fallback memo / short-lived circuit-breaker per:

- effective upstream host
- request class

when `006a` shows that repeated direct failures would otherwise cause repeated direct-fail-then-fallback churn.

This memo must be:

- Cloud-local only
- non-persistent
- bounded by time and/or entry count
- safe to lose on refresh

## Player-State Integrity
Any fallback added around playback-adjacent logic must preserve:

- latest-request-wins behavior
- valid recovery path after failed direct attempt
- no stuck loading state
- no double play or double pause transitions
- no duplicate prefetch storms

If native `<audio>` playback fallback is implemented, the child instruction must explicitly document:

- how the proxied media URL is generated
- when the player switches from direct URL to proxied URL
- how latest-request-wins is preserved during source switches
- how seek/reload behavior is expected to work after the switch

## Required Patterns
- narrow wrappers around existing media fetch points
- explicit fallback URL builder for Cloud backend media requests
- request-class-specific retry policy
- clear guardrails so Lite code is not modified by accident
- explicit separation between native media-element fallback and JS fetch fallback

## Forbidden Shortcuts
- do not globally route every media URL through the backend
- do not remove direct browser playback first
- do not add Cloud-only UI controls to expose the fallback
- do not mutate Lite proxy settings behavior as part of this instruction

## Tests
At minimum, add or update Cloud frontend tests proving:

- direct path stays direct when it succeeds
- backend fallback is activated for supported browser/CORS failure cases
- unsupported failure cases do not silently retry forever
- blob/local playback still bypasses network fallback
- tracking URL unwrap behavior is preserved where required

## Verification
1. `pnpm -C apps/cloud-ui build`
2. targeted `vitest` for playback/prefetch/download/transcript fallback behavior
3. manual runtime verification through `http://localhost:8080`

## Done When
- Cloud media-adjacent fallback routing is explicit and narrow
- successful direct browser access is preserved
- fallback uses Cloud backend only where approved and tested

## Completion
- Completed by: Codex
- Reviewed by: Codex reviewer
- Commands:
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/fetchUtils.test.ts src/lib/__tests__/audioPrefetch.test.ts src/lib/__tests__/remoteTranscriptCache.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `pnpm -C apps/cloud-ui build`
  - `curl -i http://localhost:8080/healthz`
  - `curl -I http://localhost:8080/`
  - `git diff --check`
- Date: 2026-03-28
