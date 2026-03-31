# Instruction 006a: Cloud Media Surface Audit [COMPLETED]

## Parent
- `006-cloud-media-fallback-default-proxy.md`

## Objective
Produce the exact media request inventory for Cloud by using Lite's current media handling as the baseline contract.

This instruction does not implement fallback yet. It identifies which request classes:

- remain browser-direct only
- already have direct-plus-fallback behavior
- currently fail without fallback
- should gain Cloud backend fallback
- must not be silently rerouted

## Goal
After this instruction:

- Cloud media request classes are explicitly enumerated
- each class has an ownership decision
- fallback candidates are narrow and request-type-specific
- later child instructions can implement backend fallback without guessing

## Baseline Sources To Audit
Use current Lite behavior as the authoritative baseline. The audit must explicitly inspect and classify these paths:

- primary audio element source assignment
  - `apps/lite/src/hooks/useAudioElementSync.ts`
  - `apps/lite/src/components/AppShell/GlobalAudioController.tsx`
- local-versus-remote playback source resolution
  - `apps/lite/src/lib/player/playbackSource.ts`
- tracking URL normalization and unwrap behavior
  - `apps/lite/src/lib/networking/urlUtils.ts`
- foreground audio prefetch
  - `apps/lite/src/hooks/useForegroundAudioPrefetch.ts`
  - `apps/lite/src/lib/audioPrefetch.ts`
- download HEAD sizing and GET streaming
  - `apps/lite/src/lib/downloadService.ts`
  - `apps/lite/src/lib/fetchUtils.ts`
- remote transcript fetch paths
  - `apps/lite/src/lib/remoteTranscript.ts`
  - `apps/lite/src/lib/fetchUtils.ts`
- remote playback orchestration and download/transcript interplay
  - `apps/cloud-ui/src/lib/player/remotePlayback.ts`

Do not rely on memory. Re-open the files before making the audit decisions.

## Required Audit Output
Create a short implementation-facing classification matrix covering at minimum these request classes:

1. primary remote audio playback through the native `<audio>` element
2. foreground audio prefetch using JS `fetch` with `Range`
3. download sizing via `HEAD`
4. download transfer via `GET`
5. remote transcript fetch
6. media fetches triggered during playback startup
7. blob/local playback
8. any media-adjacent path that unwraps tracking URLs before fetching

For each class, record:

- request initiator
- current browser behavior in Lite
- current Cloud behavior
- whether `fetchWithFallback` is already involved
- whether user-configured proxy fallback exists today
- whether Cloud backend fallback should exist
- fallback trigger type
- non-goals / reasons not to fallback

## Decision Rules
The audit must apply these rules:

- native `<audio src=...>` is not the same request class as JS `fetch`
- `HEAD`, `GET`, and `Range GET` must be classified separately
- redirect chains must be treated as part of the effective upstream behavior
- tracking URL unwrapping is part of the baseline contract and must not be dropped accidentally
- local `blob:` playback must remain browser-local and must not be proxied
- ASR provider requests are out of scope unless they are directly blocked by media-source fetch constraints covered by `006`

## 8-Scope Scan
The audit write-up must include a short scan across:

- config
- persistence
- routing
- logging
- network
- storage
- UI state
- tests

Also include adjacent risk notes for:

- duplicate fallback retries
- stale async completions during source switches
- playback startup re-entrancy
- prefetch/download overlap

## Deliverable
Document the audit result in a fixed file:

- `apps/docs/content/docs/apps/cloud/handoff/media-fallback-audit.md`

If that file has a Chinese counterpart in the same docs area, update it too.

At minimum, the execution agent must leave enough written evidence that later child instructions can answer:

- which media paths need backend fallback
- which paths should remain browser-only
- which fallback triggers are safe
- which trigger types would over-proxy traffic

The audit must explicitly separate:

- native `<audio src>` transport behavior
- JS `fetch` transport behavior
- `HEAD`
- plain `GET`
- `Range GET`

## Tests
No new product behavior is implemented in this instruction, but the audit must identify the test files that later instructions will need to update or add.

At minimum, identify likely coverage targets for:

- audio prefetch behavior
- download fallback behavior
- transcript fallback behavior
- playback source resolution
- backend range proxy behavior

## Verification
1. Re-open all Lite baseline files listed in this instruction
2. Re-open the current Cloud equivalents before writing the audit classification
3. `rg -n "fetchWithFallback|audio\\.src|Range:|method: 'HEAD'|unwrapPodcastTrackingUrl" apps/lite/src apps/cloud-ui/src`

## Done When
- every Cloud media-relevant request class is classified
- fallback candidates are explicit and narrow
- later child instructions can proceed without guessing Lite media behavior

## Completion
- Completed by: Codex execution worker
- Reviewed by: Codex reviewer
- Commands: `sed`, `rg -n "fetchWithFallback|audio\\.src|Range:|method: 'HEAD'|unwrapPodcastTrackingUrl" apps/lite/src apps/cloud-ui/src`
- Date: 2026-03-28
