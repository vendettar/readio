# Instruction 006d: Cloud Media Range Seek Regression Coverage [COMPLETED]

## Parent
- `006-cloud-media-fallback-default-proxy.md`
- `006b-cloud-media-fallback-proxy-contract.md`
- `006c-cloud-media-client-fallback-routing.md`

## Objective
Prove that Cloud media fallback does not break playback continuity, seek behavior, or local-media assumptions.

This instruction is test-focused. It should tighten both backend and frontend regression coverage around the fallback-first media contract.

## Goal
After this instruction:

- `Range` and seek behavior are explicitly tested
- direct success versus fallback activation is proven
- player-state transitions remain recoverable
- download and transcript flows remain aligned with Lite expectations

The regression suite must not rely only on whichever real-world upstream host happens to fail today.
At least one fallback-required path must be tested through deterministic mocked/controlled fixtures.

## Required Coverage
At minimum, add or strengthen tests for:

1. direct browser path succeeds and backend fallback is not used
2. direct browser path fails in a supported retry category and backend fallback is used
3. proxied `Range` request returns `206` and the client path remains seek-compatible
4. fallback path does not break blob/local playback
5. download HEAD sizing and GET streaming still behave correctly
6. transcript fetch fallback still respects the expected parse path
7. source switch during pending media work does not leave stale completions mutating current state

At least one case in items 2-3 must be deterministic via:

- mocked media host behavior
- controlled proxy fixture
- or equivalent stable local test harness

Do not rely solely on live upstream hosts to prove fallback-required behavior.

## Topology And State Requirements
Tests must verify not just returned data, but also state transition integrity:

- no permanent loading state after failed direct attempt
- no action-blocking mode after fallback failure
- no duplicate in-flight prefetch loops
- no stale media response attached to the wrong current source

## Backend Coverage
Back-end tests must lock down:

- `Range` request forwarding
- `206 Partial Content` pass-through
- `416 Range Not Satisfiable` behavior if applicable
- redirect-aware behavior for media hosts
- timeout/error mapping

## Frontend Coverage
Front-end tests must lock down:

- request routing choice
- retry trigger classification
- playback startup integrity
- seek-compatible behavior assumptions
- download/transcript compatibility

## Manual Verification
Manual runtime verification through Cloud must include:

- start playback for an episode that works browser-direct
- start playback for an episode that requires fallback due to browser media fetch limitations
- seek/drag after playback starts
- confirm no player soft-lock after fallback activation
- confirm local downloaded playback still works after the new fallback logic lands

If the fallback-required runtime case cannot be reproduced reliably against a real upstream host, use the deterministic fixture environment from the automated coverage instead of guessing from production traffic.

## Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted `vitest` coverage for fallback/range/seek/player-state paths

## Done When
- fallback behavior is proven by tests, not inferred
- range/seek compatibility is explicitly covered
- playback state remains recoverable across direct and fallback paths

## Completion
- Completed by: Codex
- Reviewed by: Codex reviewer
- Commands:
  - `pnpm -C apps/cloud-ui exec vitest run src/lib/__tests__/playbackSource.test.ts src/lib/__tests__/fetchUtils.test.ts src/lib/__tests__/audioPrefetch.test.ts src/lib/__tests__/remoteTranscriptCache.test.ts src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
  - `go test ./...` in `apps/cloud-api`
  - `pnpm -C apps/cloud-ui build`
  - `curl -i http://localhost:8080/healthz`
  - `curl -I http://localhost:8080/`
  - `git diff --check`
- Date: 2026-03-28
