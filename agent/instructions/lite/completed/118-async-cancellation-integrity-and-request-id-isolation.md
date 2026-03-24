# Task: 118 (Patch) - Async Cancellation Integrity + Request-ID Isolation [COMPLETED]

## Goal
Eliminate remaining async-control-flow weaknesses discovered in second-stage review:
- ensure abort semantics are propagated to real network requests (not only post-await state guards),
- prevent unrelated async operations from cancelling each other via shared request-id counters,
- reduce redundant re-fetch loops caused by cross-domain request-id contention.

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: no schema changes.
- Routing: no route shape changes.
- Logging: add precise abort/reason context where cancellation is intentional.
- Network: propagate `AbortSignal` end-to-end in async fetch paths.
- Storage: no storage contract changes.
- UI state: avoid stale/loading oscillation from request-id contention.
- Tests: add concurrency/cancellation regression tests.

## Hidden Risk Sweep
- Async control flow:
  - external `signal` parameters currently used as post-check guards in some store actions; this does not cancel underlying I/O.
  - shared `loadRequestId` in `exploreStore` spans subscriptions/favorites/write flows and can cause cross-flow invalidation.
- Hot-path performance:
  - avoid duplicate request retries triggered by request-id interference.
- State transition integrity:
  - loading flags should settle deterministically under concurrent init calls.

## Required Patterns
- Cancellation contract must be transport-aware:
  - pass `signal` to the operation that actually does I/O whenever supported.
- Request sequencing must be domain-isolated:
  - independent async domains use independent request-id channels/counters.
- Ignore-stale checks remain required, but cannot replace proper abort propagation.

## Forbidden Dependencies
- No single shared request-id counter for unrelated async domains (subscriptions/favorites/search/podcast detail).
- No API signatures advertising cancellability while underlying operation is uncancellable.

## Implementation Steps
1. End-to-end cancellation propagation (blocking)
   - Review and update async paths that currently only check `signal?.aborted` after awaited calls.
   - Prioritize:
     - `apps/lite/src/store/exploreStore.ts` (`performSearch`, `selectPodcast`, and other network-backed flows),
     - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`,
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`.
   - Ensure React Query/store-provided `signal` is forwarded to discovery calls when signatures support it.

2. Request-id isolation in explore store (blocking)
   - Refactor `apps/lite/src/store/exploreStore.ts` request-id strategy:
     - replace shared `loadRequestId` with domain-specific counters (e.g., subscriptions, favorites, write ops).
   - Prevent `loadSubscriptions()` and `loadFavorites()` from mutually invalidating completion state during app init.

3. Initialization concurrency stabilization (important)
   - Validate interaction between:
     - `apps/lite/src/hooks/useAppInitialization.ts`,
     - `apps/lite/src/store/exploreStore.ts`.
   - Ensure first-mount parallel loads do not create redundant extra load cycles from request-id contention.

4. Tests (important)
   - Add tests proving:
     - concurrent `loadSubscriptions` + `loadFavorites` complete without cross-canceling,
     - aborted search/podcast actions cancel or safely drop stale state updates,
     - content page country switches do not leave stale loading/error states from uncancelled old requests.

5. Docs sync (EN + ZH)
   - Update async/cancellation behavior notes where relevant:
     - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`

## Acceptance Criteria
- Cancel-capable flows pass `signal` to actual network/discovery calls.
- `exploreStore` no longer uses one shared request-id for unrelated async domains.
- Initial app load can run subscriptions/favorites loads concurrently without one suppressing the other.
- No stale overwrite or stuck-loading regressions in switched-country content routes.

## Required Tests
- Store-level race tests for explore async domains.
- Route/component tests for cancellation + stale-response protection.
- Existing lint/guard scripts remain green.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/store/exploreStore.ts`
  - `apps/lite/src/hooks/useAppInitialization.ts`
  - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
  - related tests under `apps/lite/src/**/__tests__`
- Regression risks:
  - over-aggressive cancellation causing dropped successful responses.
  - request-id refactor breaking existing optimistic UI updates.

## Decision Log
- Required: Waived (unless cancellation contract/public behavior semantics are materially changed).

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite lint:route-guards`
  - `pnpm -C apps/lite lint:legacy-route-ban`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-13

## Backfill Queue (From Instruction 120 Full Review)

- Source finding: `C-20260213-001` (`agent/reviews/lite/120-phase-C-report.md`)
- Gap:
  - `apps/lite/src/store/playerStore.ts` still assigns `loadRequestId` with `Date.now()` in multiple reset/load paths (`setAudioUrl` / `loadAudio` / `loadAudioBlob`).
  - Millisecond collisions can weaken stale-async invalidation.
- Required follow-up:
  1. Replace timestamp token assignment with monotonic counter increments.
  2. Keep existing request-id equality guard behavior unchanged otherwise.
  3. Add regression test covering rapid consecutive resets in the same tick.
- Verification:
  - `pnpm -C apps/lite test:run src/store/__tests__/playerStore.test.ts src/hooks/__tests__/useAppInitialization.test.ts`
