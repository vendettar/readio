# Instruction 006: Cloud Discovery Shared Schema, Client, And Cache Refactor

Clean up the remaining shared discovery infrastructure so contracts are no longer provider-ambiguous, UI parsing is no longer permissive by accident, and backend cache helpers no longer leak dead fields and `any`-typed response paths.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: Medium
- **Owner Stream**: Cloud API/Cloud UI discovery shared infrastructure
- **Depends on**: Instructions 001-005 define the route-specific ownership boundaries

## 2. Constraint Check

- This instruction is infra cleanup in service of the route-specific contracts from the earlier refactor instructions.
- It must not reintroduce deleted compatibility layers or widen route contracts again.
- Current in-repo canonical identities
  - show = `podcastItunesId`
  - episode route = canonical `episodeGuid` encoded as compact key
  - editor-pick source lookup = PI `podcasts/batch/byguid`
  - authoritative detail/enrichment = PI `podcasts/byitunesid`, `episodes/byitunesid`, `episodes/byguid`
  - RSS = fallback only
- Raw upstream field names from Apple/PodcastIndex docs are not automatically part of the cloud contract.

## 3. Problem Statement

The discovery stack still carries shared infrastructure debt:

1. backend shared DTOs overload `id` semantics across Apple, PI, and feed-backed data
2. UI schemas are permissive and optional-heavy, so legacy test payloads still parse successfully
3. UI discovery client GET/POST helpers duplicate logic and surface inconsistent invalid-payload behavior
4. backend cache helper plumbing still stores dead fields and returns `any`, forcing route-level type assertions
5. Tests and fixtures still preserve upstream-only or already-deleted compatibility fields such as `feedId` and `collectionViewUrl`, which can drag those contracts back in during refactor.

This instruction creates a cleaner baseline for the later coding phase.

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Shared DTOs must not hide provider-specific identity semantics behind a single `id` field | This already causes route misuse in UI consumers |
| D2 | Zod contracts for active discovery payloads should be strict by default | Silent acceptance of old field names keeps deleted behavior alive |
| D3 | Discovery client response parsing/error mapping should be centralized | Duplicated client plumbing drifts quickly |
| D4 | Backend cache helpers should not carry dead fields or `any`-only response typing when route-specific contracts are known | Reduces invalid type assertions and hidden dead code |
| D5 | If a field has no production reader and only schema/test residue, it must either be deleted or justified as external compatibility | Prevents dead contracts from surviving by inertia |

## 5. Affected Methods / Types

### Cloud API

- `apps/cloud-api/discovery.go`
  - `discoveryPodcastResponse`
  - `podcastIndexFeedSummaryResponse`
  - `episodeLookupResponse`
  - `discoveryCacheEntry`
  - `getWithGracefulDegradation`

### Cloud UI

- `apps/cloud-ui/src/lib/discovery/schema.ts`
- `apps/cloud-ui/src/lib/discovery/cloudApi.ts`
- `apps/cloud-ui/src/lib/discovery/index.ts`
- any discovery tests that still pass legacy field names through permissive schemas

## 6. Required Changes

### Scope Boundary

This instruction is the shared-infra cleanup pass that should follow the route-specific ownership work from Instructions 001-005.

It owns:

- shared discovery DTO cleanup
- shared UI schema strictness
- shared discovery client parsing/error mapping
- shared cache/helper typing and dead-state removal

It does not own first-pass correction of route behavior that already belongs to:

- top routes
- search click-through
- PI relay validation
- editor-pick identity
- RSS fallback/page sequencing

If a route-specific fix and a shared cleanup compete, prioritize the route-specific explicit type/contract first and return here later to collapse only what is semantically safe to share.

### A. Stop using provider-ambiguous shared DTOs where route-specific DTOs are known

Refactor the shared DTO layer so that:

- Apple chart rows do not pretend to be PI detail objects
- PI detail objects do not pretend to be Apple search hits
- route-specific `id` semantics are explicit

If a shared model remains, it must only represent fields that are semantically identical across all participating providers.

### B. Make UI schemas strict enough to reject legacy field drift

For active discovery contracts:

1. use strict object parsing or equivalent enforcement
2. do not rely on “all optional” schemas for production-owned payloads
3. remove support for legacy field names that are no longer part of the active cloud contract

Important test cleanup target:

- tests currently passing with old shapes such as `collectionName`, `artistName`, `artworkUrl100`, `feedId`, `collectionViewUrl` into active PI/detail UI paths must be rewritten

For current in-repo cloud-api + cloud-ui, these are delete-safe cleanup targets unless a documented out-of-repo consumer depends on the JSON shape. If such a consumer exists, treat the field removal as a breaking API change and gate it explicitly instead of silently preserving it.

### C. Centralize discovery client parsing/error mapping

Unify `fetchDiscoveryJSON` and `postDiscoveryJSON` on one parsing path that:

- handles invalid JSON
- handles error payload extraction
- preserves pathname/method context
- returns one consistent discovery-client error family

### D. Remove dead cache/helper state

Review `discoveryCacheEntry.cacheStatus` and other dead shared-helper state.

If a field is no longer read anywhere, remove it.

Then review `getWithGracefulDegradation` and related callers:

- reduce `any`-typed paths where route-specific response types are already known
- stop forcing downstream handlers to type-assert values that the fetch closure already knows

The target is a smaller, less ambiguous shared discovery infra layer, not a generic abstraction tower.

### E. Must Not Regress

- Route-specific DTO narrowing must land before or alongside shared cleanup; do not start by rebuilding a bigger shared abstraction and then force routes back onto it.
- If a shared model remains, it must represent the semantic intersection of participating routes, not a convenience superset of Apple + PI + RSS fields.
- Strict schema work must reject unsupported legacy fields in active contracts; do not use blanket `.optional()` or passthrough parsing to keep stale fixtures green.
- `getWithGracefulDegradation` typing improvements must preserve existing success/stale-fallback semantics while removing avoidable `any` assertions.
- Public-field cleanup for `feedId`, `collectionViewUrl`, and raw Apple aliases is delete-safe only after an explicit in-repo caller audit; if an out-of-repo consumer exists, treat that as a gated breaking change instead of silently preserving the field forever.

### F. Changed-Zone Tests To Rewrite Or Clean Up

- `apps/cloud-ui/src/lib/discovery/__tests__/cloudCutover.sameOrigin.test.ts`
- `apps/cloud-ui/src/lib/discovery/__tests__/cloudSearchCutover.sameOrigin.test.ts`
- `apps/cloud-ui/src/store/__tests__/exploreStore.test.ts`
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.refresh.test.tsx`
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastShowPage.countrySwitch.test.tsx`
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastShowPage.hydration.test.tsx`
- `apps/cloud-ui/src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`
- `apps/cloud-ui/src/components/EpisodeRow/__tests__/useEpisodeRowFavoriteAction.test.tsx`

For these changed-zone tests:

- remove unsupported legacy fields when they no longer belong to the active contract
- prefer route-specific fixtures over “one payload fits everything” shared fixtures
- fail tests when ambiguous `id` semantics leak back in

### G. Recommended Rollout Order

1. Land route-specific contract ownership from Instructions 001-005 first.
2. Make shared discovery client parsing/error mapping consistent.
3. Tighten shared UI schemas around the now-narrow route contracts.
4. Remove dead cache/helper state and reduce avoidable `any` typing.
5. Sweep stale fixtures/tests that only passed because shared contracts were too permissive.

## 7. Forbidden Outcomes

- No new mega-schema that merges all provider fields again
- No permissive `.optional()` blanket schema just to keep legacy tests green
- No new generic infra that obscures route ownership
- No reintroduction of deleted compatibility fields solely because old tests or fixtures still mention them

## 8. Verification Plan

### Required Automated Verification

- `go test ./...` in `apps/cloud-api`
- `pnpm -C apps/cloud-ui typecheck`
- changed-zone vitest covering:
  - strict parsing rejects unsupported legacy payload fields where appropriate
  - shared discovery client returns typed invalid-payload errors
  - cache helper cleanup does not change existing success/fallback semantics

### Required Manual Verification

1. Smoke test Explore, Search, show page, episodes page, and episode detail after the DTO/schema split.
2. Confirm no active UI path still depends on ambiguous `id` semantics.

## 9. Acceptance Criteria

- [ ] provider-ambiguous shared DTO usage is reduced to semantically safe fields only
- [ ] active UI discovery schemas are strict enough to reject unsupported legacy payloads
- [ ] discovery GET/POST client helpers share one parsing/error path
- [ ] dead cache/helper state is removed
- [ ] backend cache helper callers no longer rely on avoidable `any` type assertions
- [ ] changed-zone tests no longer preserve unsupported legacy fields without an explicit compatibility reason
- [ ] no active route is forced back onto a provider-ambiguous mega-schema just to simplify the shared layer

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
