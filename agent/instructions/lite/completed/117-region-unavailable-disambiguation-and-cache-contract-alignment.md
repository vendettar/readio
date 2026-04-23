# Task: 117 (Patch) - Region-Unavailable Error Disambiguation + Cache Contract Alignment [COMPLETED]

## Goal
Close the remaining correctness and robustness gaps after Instruction 116 by:
- preventing `regionUnavailable` from masking real network/data failures,
- enforcing one cache contract for podcast lookup/feed/provider-episodes across content pages and resolver hooks,
- restoring complete request-cancellation semantics by propagating React Query `signal` in podcast content page queries,
- adding explicit regression protection for route-country switch cancellation/stale-response overwrite,
- preserving canonical path-only URL behavior while documenting intentional legacy query-hint tolerance.

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: no schema changes.
- Routing: no route shape changes; keep `/$country/podcast/*` as canonical contract.
- Logging: add explicit reason tags for region-unavailable vs fetch-failure branches.
- Network: no new endpoints; only branch semantics and request lifecycle handling.
- Storage: no new storage engine; only query-key/TTL consistency.
- UI state: refine error-state transitions so users always have a valid recovery path.
- Tests: add targeted tests for negative-path classification and request cancellation on country switch.

## Hidden Risk Sweep
- Async control flow:
  - country switch during in-flight lookup/feed/provider requests must cancel old requests and prevent stale overwrite.
  - page-level query functions in content routes must forward abort `signal` to discovery calls, otherwise cancellation contracts are only partial.
  - negative-path branches must not race and incorrectly classify failures as region-unavailable.
- Hot-path performance:
  - cache contract unification must reduce duplicate fetches, not introduce extra fetch loops.
- State transition integrity:
  - action states must never trap user in non-recoverable views.
- Dynamic context consistency:
  - content pages must remain route-country authoritative; no global-country fallback for correctness.

## Required Patterns
- Route country (`$country`) is the only correctness authority in content routes.
- `regionUnavailable` is a strict business-state classification, not a generic failure fallback.
- Feed cache key uses normalized feed URL only.
- Lookup/provider-episodes remain country-scoped.
- URL correctness remains path-only; legacy query hints are ignored/stripped, not used for correctness.
- No compatibility obligations for old data/old paths (first-release policy).

## Forbidden Dependencies
- No hidden fallback to global/default country in content resolution.
- No branch that shows region-unavailable when upstream fetch has failed.
- No mixed feed key variants (`raw feedUrl` + `normalized feedUrl`) in parallel.
- No reintroduction of correctness-critical URL search hints.

## Implementation Steps
1. Region-unavailable classification hardening (blocking)
   - Update:
     - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
   - Enforce explicit branch order:
     1) fetch/runtime error states,
     2) not-found semantics (if applicable),
     3) region-unavailable only when upstream lookup/feed/provider flows are successful but route-country content cannot resolve.
   - Add explicit logging reason tags for branch diagnostics.

2. Cache contract unification (blocking)
   - Update:
     - `apps/lite/src/hooks/useEpisodeResolution.ts`
     - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
   - Unify query key policy:
     - feed key: `['podcast', 'feed', normalizedFeedUrl]`
     - lookup key: `['podcast', 'lookup', podcastId, country]`
     - provider episodes key: `['podcast', 'provider-episodes', podcastId, country]`
   - Align TTL/GC policy across these entry points to a single declared contract.
   - Ensure page-level query functions accept React Query `signal` and pass it through to discovery layer calls (`getPodcast`, `fetchPodcastFeed`, fallback `getPodcastEpisodes`).

3. Country switch request-lifecycle regression coverage (important)
   - Add tests proving:
     - switching `/$country` triggers new key queries,
     - old in-flight requests are cancelled/ignored,
     - stale response cannot overwrite new-country view state.
   - Target tests in podcast route component test suites and resolver hook tests.

4. URL contract behavior codification (important)
   - Keep `z.object({})` tolerance semantics for legacy query hints on content routes.
   - Add/maintain tests confirming hints are ignored and do not affect correctness.
   - Ensure docs explicitly state:
     - ignored (not rejected) behavior is intentional,
     - canonical links remain path-only.

5. Docs + decision sync (atomic)
   - Update EN + ZH:
     - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`
     - `apps/docs/content/docs/apps/lite/routing.mdx`
     - `apps/docs/content/docs/apps/lite/routing.zh.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/discovery.zh.mdx`
   - If a new architectural contract is finalized, record it in decision log EN + ZH in the same task.

## Acceptance Criteria
- Region-unavailable is never shown for raw network/lookup/feed/provider failures.
- Region-unavailable is shown only for true route-country availability mismatch with successful upstream fetch path.
- Podcast feed cache uses one normalized key contract across show/episodes/detail resolver paths.
- Route-country change triggers new-country query path and stale responses do not overwrite current view.
- Legacy query hints on `/$country/podcast/*` are ignored/stripped and do not participate in correctness.
- EN/ZH docs are synchronized and reflect final runtime behavior.

## Required Tests
- Component tests for Show/Episodes/Detail negative-path classification:
  - fetch fail -> error state,
  - successful upstream + unresolved content -> region-unavailable + recovery CTA.
- Resolver/route tests for country switch:
  - new key activation + stale cancellation/no overwrite.
- Route search schema tests:
  - legacy hints parse to `{}` and do not affect behavior.
- Guardrail tests:
  - existing route guard scripts continue passing with no false positives.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
  - `apps/lite/src/hooks/useEpisodeResolution.ts`
  - podcast-related tests under `apps/lite/src/**/__tests__`
  - routing/episode-resolution/handoff docs (EN + ZH)
- Regression risks:
  - over-tightened branch conditions hiding legitimate region-unavailable states.
  - cache policy mismatch with existing discovery provider refresh callbacks.
  - missing test coverage for abort semantics causing future regressions.
- Required verification:
  - automated command set above,
  - manual click-through:
    - Explore -> Episode,
    - Search -> Episode,
    - History/Favorites -> saved-country Episode,
    - then switch global country and repeat.

## Decision Log
- Required: Yes (if any new cache/error-classification contract is formalized).

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
