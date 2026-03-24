# Instruction 115a: Foreground Lightweight Audio Prefetch (Post-115) [COMPLETED]

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`

## Goal
Add a simple, safe, **foreground-only** audio prefetch policy to improve seek continuity after baseline SW hardening.

This instruction is **not** background download (`115b`) and must not introduce new download-manager complexity.

## Scope
- Lite app playback path only.
- Reuse existing networking/cache stack; do not add new infra.
- No route changes, no Dexie schema changes, no new global state library.

## Affected Modules (Expected)
- Playback controller / audio event pipeline modules in `apps/lite/src/components/AppShell/` and `apps/lite/src/hooks/`.
- Network/prefetch helper modules in `apps/lite/src/lib/`.
- Tests under `apps/lite/src/**/__tests__/` covering playback continuity and request behavior.

## Regression Risks
- Playback state machine regression (unexpected play/pause thrash under weak network).
- Duplicate prefetch dispatch due to race conditions in timeupdate/buffer checks.
- Incorrect network degradation branching (`saveData`/`effectiveType`) causing over-fetch or no-fetch.

## Required Strategy (Implement Exactly)
1. Trigger condition:
   - When buffered-ahead is `< 20s`, schedule one prefetch attempt.

2. Prefetch target size:
   - Compute with recent bitrate estimate:
     - `bytesTarget = recentBitrateBytesPerSec * 30`
   - Clamp:
     - min `256KB`
     - max `2MB`
   - Bitrate estimation contract:
     - Use a rolling window over the latest successful media transfer samples (`>= 3` samples).
     - If estimate is missing/invalid (`0`, `NaN`, negative), use fallback `64KB/s` before window adjustment and clamping.
     - Estimation failure must never block playback or throw.

3. Concurrency and rate control:
   - Max inflight prefetch requests: `1`
   - Minimum interval between attempts: `9s` (fixed value; document the constant in code).
   - Request de-duplication:
     - Use dedupe key `sourceId + rangeStart + rangeEnd`.
     - Duplicate key while inflight must be dropped.

4. Network-aware degradation:
   - If `navigator.connection.saveData === true` or effectiveType is `2g`: disable prefetch.
   - If effectiveType is `3g`: reduce target window to `15s` before clamping.
   - If `4g`/`wifi`/unknown: keep `30s` window before clamping.

5. Failure policy:
   - Prefetch failure must be silent (no user toast).
   - Never interrupt active playback state machine.

6. Lifecycle cancellation and reset:
   - On track/source switch, playback teardown, or component unmount: abort any in-flight prefetch request immediately.
   - Reset prefetch scheduler gates/timestamps on new source activation to avoid stale carry-over between tracks.

7. Source eligibility:
   - Apply prefetch only to remote `http(s)` audio sources.
   - Do not prefetch for local files, `blob:` URLs, or `data:` URLs.

8. NetworkInformation fallback:
   - If `navigator.connection` is unavailable, treat network as `unknown` and use baseline `30s` window before clamping.
   - Missing network APIs must not throw or block playback.

9. Request range semantics:
   - Prefetch must request bytes ahead of the current buffered tail (forward-only), not from byte `0`.
   - Avoid redundant overlapping fetches for already-buffered ranges.
   - Range handling:
     - `Range` must be computed as `bytes=start-end` with `start = bufferedTailByte + 1`.
     - `206` is success path; `200` or no-range support must be treated as non-prefetch-eligible response and aborted silently.
     - Never fallback to full-file fetch in this instruction.

10. Trigger hysteresis (anti-flap):
   - Prefetch arming threshold remains `< 20s`.
   - After one attempt, re-arm only when buffered-ahead recovers to `>= 25s` to prevent rapid re-trigger near threshold.

11. Failure backoff:
   - Keep base interval floor `9s`.
   - On consecutive failures for the same source, apply capped backoff: `9s -> 18s -> 36s` (max `36s`).
   - Reset backoff after one successful prefetch or source switch.

12. Stale response discard:
   - Prefetch response must be applied only if `sourceId` still matches current active source at completion time.
   - Late responses from old source must be ignored and must not mutate current scheduler state.

## Explicit Non-Goals
- Do not implement full-episode background fetch.
- Do not add modal/UI flows for download management.
- Do not change current playback controls behavior.
- Do not add migration/backward-compat code.

## Engineering Rules
- Keep logic in focused playback/network modules; avoid scattering in UI components.
- Keep user-facing copy i18n-compliant if any text is added.
- Keep styles/design untouched unless strictly needed.

## Required Patterns
- Reuse existing request cancellation/retry primitives where available; do not create a second prefetch scheduler.
- Keep prefetch side effects isolated from playback state transitions (no direct state toggles to `playing/paused/loading` from prefetch path).
- Guard all prefetch entry points with concurrency and interval checks before issuing network requests.

## Forbidden Dependencies
- No new download manager queue.
- No new background worker / service worker task type for this instruction.
- No new persistent prefetch table or schema.

## Acceptance Criteria
- Prefetch is attempted only when `bufferedAhead < 20s`.
- Prefetch target bytes strictly follows:
  - baseline window `30s` (`4g`/`wifi`/unknown),
  - degraded window `15s` (`3g`),
  - disabled (`saveData=true` or `2g`),
  - then clamped to `[256KB, 2MB]`.
- At any time, inflight prefetch request count is `<= 1`.
- Prefetch attempts are rate-limited by a fixed `9s` interval.
- Prefetch failure produces no user-facing toast and does not alter playback state machine.
- On source switch/unmount, in-flight prefetch is aborted and scheduler state is reset.
- Prefetch is never attempted for local/`blob:`/`data:` sources.
- Absence of `navigator.connection` falls back to baseline behavior without runtime errors.
- Prefetch requests target forward ranges after buffered tail, not repeated file-head ranges.
- Bitrate estimate fallback is deterministic (`64KB/s`) when recent samples are invalid/missing.
- Prefetch dedupe prevents duplicate inflight requests for identical source/range.
- Unsupported Range responses do not degrade into full-file fetch.
- Trigger hysteresis is enforced (`<20s` arm, `>=25s` re-arm).
- Consecutive failures apply capped backoff (`9s/18s/36s`) and reset on success/source switch.
- Stale responses from previous source are discarded.

## Verification (Required)
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`
- `pnpm --filter @readio/lite test:run`
- `pnpm --filter @readio/lite build`

Manual checks:
1. Start remote podcast playback; verify normal playback unaffected.
2. In DevTools Network throttling (`Slow 3G`), trigger repeated seek; verify no play/pause thrash.
3. Toggle `navigator.connection.saveData=true` (or simulate via test/mocks); confirm prefetch is disabled.
4. Confirm no toast appears on prefetch fail (force 4xx/5xx prefetch response).
5. In DevTools Network panel, filter prefetch requests and confirm no more than one concurrent request.
6. Confirm prefetch dispatch interval is never less than `9s` between attempts.
7. Switch tracks rapidly and unmount/remount playback surface; confirm prior prefetch is aborted and no stale retry continues on old source.
8. Play local file (`blob:` source) and confirm prefetch path is not triggered.
9. In environment without `navigator.connection` (or mocked undefined), confirm no runtime error and baseline prefetch policy still applies.
10. Force invalid bitrate estimate (empty sample window / zero throughput) and confirm fallback `64KB/s` path is used.
11. Mock upstream without Range support (`200` full response) and confirm prefetch aborts silently without full-file download.
12. Keep buffer near threshold (19-21s oscillation) and confirm hysteresis prevents rapid repeated dispatch.
13. Simulate repeated failures on same source and confirm backoff sequence (`9s -> 18s -> 36s`) then reset after success.

## Documentation Update (Required for Done)
Update:
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

Document only results:
- Foreground-only prefetch policy
- Trigger threshold, clamp range, and concurrency limit
- Network-aware degradation rules

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/AppShell/*` (audio controller/playback integration)
  - `apps/lite/src/hooks/*` (buffer observation, scheduling, retry/cancel wiring)
  - `apps/lite/src/lib/*` (prefetch/network helper logic)
  - `apps/lite/src/**/__tests__/*` (playback continuity and request-behavior coverage)
- Regression risks:
  - accidental coupling to playback status transitions.
  - concurrency gate bypass leading to duplicate inflight prefetch requests.
  - incorrect `effectiveType` branching causing over-fetch on constrained networks.
- Required verification:
  - run full command set above (`lint`, `typecheck`, `test:run`, `build`).
  - manual DevTools verification for concurrency, interval floor (`9s`), and degradation behavior.

## Decision Log
- Required: Waived (tactical performance policy refinement under existing audio-engine direction).

## Bilingual Sync
- Required: Yes (audio-engine handoff EN + ZH).

## Completion
- Completed by: Codex
- Reviewed by: Codex (Reviewer)
- Commands:
  - `pnpm --filter @readio/lite lint`
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-15
- Reviewed by: sirnull
