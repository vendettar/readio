# Instruction 019: Cloud Transcript-First Playback — No Automatic ASR When Transcript Exists [COMPLETED]

> Focused playback/transcript contract fix only. Do not redesign generic playback, download architecture, `/api/proxy`, or ASR provider transport.

## Problem

Current Cloud playback behavior can start remote streaming immediately, then later download full audio and invoke ASR even when the episode already exposes a usable `transcriptUrl`.

That is the wrong product contract for transcript-bearing episodes:

- if transcript already exists, playback should use it first
- playback should not escalate into automatic ASR
- playback should not download full audio only for ASR fallback

This causes:

- unnecessary full-audio downloads
- unnecessary `/transcriptions` calls
- unnecessary `/api/proxy` audio fetches for ASR input
- confusing UX such as "Downloading audio..." while playback is already running

## Goal

Establish a transcript-first playback contract:

1. If an episode has `transcriptUrl`
   - treat transcript loading as the primary preparation path for transcript-bearing playback
   - load transcript from `transcriptUrl` before committing the normal transcript-bearing reading playback surface
   - cache/store transcript through the existing transcript path
   - short-circuit before any ASR readiness/configuration check
   - do **not** automatically invoke ASR
   - do **not** automatically download full audio for ASR
   - do **not** show generic ASR/download placeholder UX as the primary state when the transcript-bearing path is active
   - do **not** show `Set up subtitle generation` CTA while still inside the transcript-bearing branch
   - while transcript preload is pending, the first user-visible full-player state must be a dedicated transcript-loading state, not `No transcript yet`
   - this transcript-loading requirement is triggered by the current playback payload carrying a non-empty `transcriptUrl`; if the payload has the field, clicking play must enter transcript-loading immediately

2. Only when an episode does **not** have `transcriptUrl`
   - and ASR is configured
   - may the app enter the "download full audio -> ASR -> playback/transcript" path

This contract must apply consistently across all remote playback entry points that carry transcript metadata.

## Scope

- `apps/cloud-ui` only
- playback/transcript orchestration only
- focused tests in the playback / transcript changed zone

## Contract Owner

This instruction is owned by the Cloud UI playback/transcript orchestration layer.

Primary owner zone:

- remote playback orchestration
- transcript ingestion orchestration
- remote-transcript / ASR decision boundary

This is **not** a backend contract change and **not** a generic media architecture rewrite.

Out of scope:

- `apps/cloud-api`
- `/api/proxy` redesign
- ASR provider selection / transport redesign
- download architecture redesign
- audioPrefetch changes
- session-restore changes

## Required Contract

### A. Transcript-first branch

When playback is requested for a remote episode with a non-empty, usable `transcriptUrl`
already present in the playback request / episode metadata:

- transcript loading is the primary preparation step for transcript-bearing playback
- playback commit for the transcript-bearing reading path must not happen until transcript preload has either succeeded or definitively failed
- transcript ingestion must prefer `transcriptUrl`
- transcript result may be cached/stored via existing transcript persistence
- ASR readiness/configuration must not be consulted for this branch
- this branch must short-circuit before provider/model/API-key gating
- automatic fallback to online ASR is **not allowed**
- automatic full-audio download for ASR input is **not allowed**
- the UI must not present transcript-bearing preload as a generic ASR setup/readiness problem
- the UI must not show `Set up subtitle generation` while the transcript-bearing branch is still authoritative

Usable `transcriptUrl` means:

- not empty after trim
- not missing from the current playback metadata
- parseable enough to enter the existing transcript ingestion path

This task does **not** require validating that the transcript source will succeed before playback starts.

If transcript loading fails:

- keep playback behavior independent
- treat it as transcript-source failure, not an automatic reason to escalate into ASR
- do not auto-trigger ASR unless a separate explicit user action or future instruction reopens that behavior
- do not convert transcript-bearing failure into an ASR readiness/settings CTA
- fall through to transcript-unavailable / no-transcript display semantics, not ASR setup semantics
- this applies to transcript fetch failure classes including:
  - network/CORS failure
  - timeout
  - 4xx/5xx response
  - transcript parse/validation failure

For transcript-bearing playback:

- only transcript caching/persistence is in scope
- automatic audio download/caching side effects are **not allowed**
- transcript-bearing playback must not create a Downloads entry merely because transcript ingestion started
- transcript-bearing playback must not trigger remote full-audio fetch solely to feed ASR
- transcript-bearing playback must not enter an ASR retry/backoff path automatically
- transcript-bearing playback must not transiently fall back to the generic artwork + `No transcript yet` empty state before transcript preload has definitively succeeded or failed

### B. ASR branch

When playback is requested for a remote episode without `transcriptUrl`:

- existing ASR-gated behavior may remain
- if ASR is configured and the contract requires blocking download first, that path may still download full audio before ASR/playback

### C. Covered entry points

This contract must be enforced across all relevant remote playback entry points, including:

- feed episode playback
- search episode playback
- favorite playback
- history/session replay

If one of these paths carries `transcriptUrl`, it must remain transcript-first and must not auto-escalate into ASR.

Required implementation discipline:

1. Start by auditing which entry points actually converge into the same remote playback/transcript orchestration.
2. Prefer fixing the shared decision boundary once, not scattering per-entry-point conditionals.
3. If an entry point does **not** reach the shared path, that divergence must be made explicit in the implementation notes and tests.

### D. Explicit bypass path

Only the explicit user-selected `stream-without-transcript` path may bypass transcript-first behavior.

No other implicit fallback or convenience branch may bypass transcript-first semantics for transcript-bearing playback.

### E. Playback independence

Transcript loading state must not be presented as if playback itself has entered the ASR/download branch.

Required semantic boundary:

- transcript-bearing preload is distinct from ASR/download preparation
- a transcript-bearing episode must not momentarily fall into the generic `Downloading...` / ASR-oriented placeholder if the branch is still transcript-first
- a transcript-bearing episode must instead enter a transcript-loading placeholder immediately after play is requested
- once transcript-bearing preload succeeds, the user-visible state should enter the reading surface directly
- if preload fails, playback may continue independently, but the UI must not reinterpret that failure as "set up ASR"

Required first-screen rule:

- if the episode payload passed into playback already includes `transcriptUrl`, the first full-player screen after clicking play must be transcript-loading
- the first-screen copy/semantics should read as transcript-loading (for example, `Loading transcript...`), not as audio download or empty transcript state
- `No transcript yet` is only valid after the transcript-bearing preload branch has definitively concluded without usable cues
- merely hiding `Set up subtitle generation` is insufficient; the loading state itself is part of the contract

This task still does not require a full UI redesign, but the implementation must preserve this stronger transcript-first semantic boundary.

### F. Minimal observability

Add minimal safe observability so reviewers/operators can confirm:

- transcript-first branch was taken
- automatic ASR was intentionally skipped because transcript exists
- transcript fetch failed but automatic ASR was still skipped

Safe observability may include:

- branch marker / mode label
- skip reason
- transcript source host or coarse source kind when already available safely

Safe observability must **not** include:

- transcript contents
- subtitle cue text
- provider secrets
- auth headers
- full sensitive query strings

Do not log transcript contents, secrets, or full sensitive payloads.

## Required Approach

1. Start with a failing reproducer test.
2. Reproduce the real problematic case:
   - ASR is configured
   - episode has `transcriptUrl`
   - playback starts
   - current implementation escalates into automatic ASR / full-audio download
3. Add at least one reproducer for transcript fetch failure on a transcript-bearing episode and prove it still does not auto-escalate into ASR.
4. Fix the orchestration so transcript-bearing playback stays transcript-first and never auto-escalates into ASR.
5. Keep the change localized to the decision boundary; do not add a second parallel playback mode.

## Preferred Implementation Direction

- Keep the change localized to playback/transcript orchestration
- Reuse existing transcript ingestion path
- Reuse existing ASR path only for transcript-missing episodes
- Do not create a second parallel playback mode just for this fix
- Keep playback-start semantics independent from transcript-fetch completion
- Prefer a single early short-circuit before ASR readiness/download orchestration starts

## Tests Must Cover

1. `transcriptUrl` present + ASR configured -> playback does not auto-trigger ASR
2. `transcriptUrl` present + transcript fetch succeeds -> transcript is applied/cached, no ASR audio download
3. `transcriptUrl` present + transcript fetch fails -> playback may continue, but no automatic ASR fallback starts
4. `transcriptUrl` present across favorite/history replay entry points -> still no automatic ASR
5. `transcriptUrl` absent + ASR configured -> existing ASR path still works
6. explicit stream-without-transcript path remains unchanged
7. transcript-bearing playback does not auto-create a download/audio-cache side effect
8. transcript-bearing playback may begin while transcript fetch is pending; transcript loading must not be treated as playback-blocking
9. transcript-bearing playback must not consult ASR readiness/configuration in the transcript-first branch
10. transcript-bearing playback must not show `Set up subtitle generation`
11. transcript-bearing playback must not commit the transcript-bearing reading playback path before transcript preload finishes
12. transcript-bearing transcript-fetch failure must not be reinterpreted as an ASR setup/readiness problem
13. transcript-bearing feed playback must enter transcript-loading immediately, before any `No transcript yet` empty-state render
14. transcript-bearing playback must not show artwork + `No transcript yet` while transcript preload is still pending

## Post-Implementation Clarification

The original wording of `transcript-first` was too easy to misread as:

- "start playback immediately"
- "fetch transcript later"
- "as long as automatic ASR is disabled, the contract is satisfied"

That interpretation is incomplete.

For completed `019`, the intended product contract is:

1. transcript-bearing playback is a distinct, transcript-first user-visible path
2. the app must not briefly route transcript-bearing playback through generic ASR/download placeholder UX
3. the app must not show `Set up subtitle generation` for transcript-bearing playback
4. transcript-bearing playback may continue independently when transcript preload fails, but that failure must remain a transcript-source failure, not an ASR-setup failure
5. only the explicit `stream-without-transcript` path may bypass these semantics

## Verification

- Run focused Cloud UI tests for:
  - playback orchestration
  - transcript ingestion
  - remote playback / ASR boundary
- Include the new reproducer test

Recommended commands:

- `pnpm -C apps/cloud-ui test:run -- src/lib/player/__tests__/remotePlayback.test.ts`
- `pnpm -C apps/cloud-ui test:run -- src/lib/__tests__/remoteTranscript.asr.test.ts`
- `pnpm -C apps/cloud-ui test:run -- src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`

## Review Focus

Reviewer must verify:

1. transcript-bearing episodes no longer auto-trigger ASR
2. transcript-bearing episodes no longer trigger full-audio ASR download
3. transcript fetch failure does not silently escalate into automatic ASR
4. all covered playback entry points follow the same contract
5. transcript-missing episodes still preserve the intended ASR path
6. no regression to explicit "play without transcript" behavior
7. transcript-bearing playback does not auto-create download side effects
8. the fix lives in a shared decision boundary rather than duplicated entry-point conditionals
9. minimal observability proves transcript-first skip decisions without leaking transcript contents or secrets

## Non-goals

- No generic ASR refactor
- No backend API changes

## Completion

- **Completed by**: Antigravity (Leadership Review)
- **Commands**: `pnpm -C apps/cloud-ui test:run -- src/lib/player/__tests__/remotePlayback.test.ts`
- **Date**: 2026-04-07
- **Reviewed by**: Antigravity (Top)
