# Instruction 008: Cloud Discovery PodcastIndex Episodes Primary Cutover [COMPLETED]

Replace the podcast content page data chain so show page, episodes page, and episode detail page no longer read episode data from RSS feed XML. `PodcastIndex /episodes/byitunesid` becomes the primary and only page-rendering source for episode lists and episode detail resolution. Legacy feed transport metadata must not participate in the active runtime contract.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: High
- **Owner Stream**: Cloud discovery backend relay + Cloud UI podcast content route cutover
- **Depends on**: Instruction 005 and Instruction 007 established the current route identity and PI-first podcast-detail ownership, but the page-rendering chain still remains RSS-shaped for episodes

## 2. Constraint Check

- Current intended route contract
  - show route = `/podcast/$country/$id`
  - episodes route = `/podcast/$country/$id/episodes`
  - episode detail route = `/podcast/$country/$id/$episodeKey`
- Current intended identity contract
  - canonical podcast identity = `podcastItunesId`
  - canonical episode identity = `episodeGuid`
- Current production chain in Cloud UI
  1. Apple API or PI batch-by-guid provides a response that includes `podcastItunesId`
  2. `podcasts/byitunesid` provides show metadata and legacy feed transport metadata
  3. content pages still use that legacy feed transport metadata -> RSS XML parsing -> internal episode DTOs
- New required chain for page rendering
  1. Apple API or PI batch-by-guid provides `podcastItunesId`
  2. `podcasts/byitunesid` provides podcast metadata
  3. `episodes/byitunesid` provides episode list/detail data for page rendering
- User-approved hard decisions in this thread
  - `/episodes/byitunesid` uses `max=1000` for content pages and direct-entry episode detail resolution
  - that coverage is considered sufficient for this product scope
  - PI `duration` is in seconds for this route and is treated as non-null for this product scope because live items are not in scope
  - fields whose upstream nullability is documented only for `liveItem` must be narrowed to non-null in this podcast-only scope
  - `descriptionHtml` must be deleted from the page-rendering episode contract
  - `feedCache` must be replaced by an `episodeCache` that stores the full `max=1000` JSON episode payload keyed by `podcastItunesId`
  - cold-open episode detail behavior is fixed: `podcasts/byitunesid` -> `episodes/byitunesid?max=1000`, and if the `episodeGuid` is absent the UI shows `episodeNotFound`
  - show-page description is owned only by `podcasts/byitunesid.description`
  - no feed-level summary concept remains after this cutover
- User-approved architecture change in this thread
  - RSS feed data must not participate in page-rendering data flow
  - legacy feed transport metadata is removed from the active page-rendering contract
- `apps/docs/content/docs/general/api/podcastindex/episodes.mdx`
  - `/episodes/byitunesid` is the intended upstream for episode-level PI data
- `apps/docs/content/docs/general/api/rss-case-samples.mdx`
  - RSS remains structurally inconsistent and must not continue owning page rendering after this cutover

## 3. Scope Scan Before Instruction

- **Config**
  - No new credential set should be introduced; reuse existing PodcastIndex auth/config path
  - Risk: new relay route bypasses existing PodcastIndex rate limit / timeout / logging policy
- **Persistence**
  - subscriptions, favorites, and downloads still persist legacy feed transport metadata and audio identity
  - Risk: page cutover must not break explicit side-channel consumers that still require that legacy field
- **Routing**
  - route keys stay `podcastItunesId` + compacted `episodeGuid`
  - Risk: implementation must not reintroduce legacy feed transport metadata or raw PI `id` as route identity
- **Logging**
  - new backend route must emit the same structured discovery logs and error mapping discipline as existing PI routes
  - Risk: page failures become opaque if the new route is not instrumented
- **Network**
  - page rendering must stop depending on browser/backend RSS fetches
  - Risk: direct-entry episode detail can silently truncate if PI episode retrieval semantics are not verified up front
- **Storage**
  - episode-page cache ownership currently hangs off legacy feed transport metadata
  - Risk: leaving feed-keyed canonical caches in place preserves the old architecture under a new name
- **UI State**
  - loading, empty, region-unavailable, and detail recovery logic currently infer state from feed fetch results
  - Risk: keeping feed-shaped assumptions produces false empty states or incorrect recovery flows
- **Tests**
  - many changed-zone tests and fixtures still encode RSS-derived episode shapes
  - Risk: permissive fixtures can preserve legacy fields and hide contract drift

## 4. Hidden Risk Sweep

- **Async control flow**
  - episode detail direct-entry resolution must not trigger duplicate full-list fetches
  - route transitions must keep a valid recovery path even when the target episode is absent from the returned 1000-item PI dataset
- **Hot-path performance**
  - do not fetch the same 1000-item PI episode payload more than once per route state change when `episodeCache` already proves coverage
  - do not block initial show-page render on unnecessary legacy feed side work
- **State transition integrity**
  - content pages must remain usable when PI returns podcast metadata successfully but episode data is empty or exhausted
- **Dynamic context consistency**
  - route country remains a navigation context, not an episode identity input
  - episode cache identity must not freeze country-specific assumptions into the canonical episode dataset

## 5. Problem Statement

The current Cloud discovery architecture is internally inconsistent:

1. route identity and show lookup are already anchored on `podcastItunesId`
2. the actual episode-rendering chain still depends on legacy feed transport metadata and RSS parsing
3. the frontend canonical episode type is still named and shaped as `FeedEpisode`, which preserves RSS ownership semantically even when PI is already involved elsewhere
4. query/cache ownership for content pages is feed-keyed rather than podcast-keyed
5. episode detail direct-entry recovery still falls back to RSS-derived content instead of the intended PI archive source

This mismatch keeps RSS as the real owner of content rendering and prevents the project from having one coherent canonical episode contract.

## 6. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Page-rendering episode ownership moves fully from RSS to `PodcastIndex /episodes/byitunesid` | Matches the approved architecture change |
| D2 | Legacy feed transport metadata is removed from the active runtime contract | Prevents RSS transport details from leaking back into content rendering |
| D3 | Canonical episode cache ownership must move from the legacy feed field to `podcastItunesId` | The content owner is the podcast identity, not the feed transport URL |
| D4 | The frontend must stop using `FeedEpisode` as the primary canonical type name for page-rendered episodes | Type naming must match source ownership and prevent semantic drift |
| D5 | Upstream PI fields must be normalized into one internal episode contract; UI must not bind directly to raw PI JSON | Keeps API boundary explicit and delete-safe |
| D6 | The cutover must not silently preserve RSS fallback for page rendering under another helper or cache layer | Prevents compatibility resurrection |
| D7 | Content pages and direct-entry detail use `episodes/byitunesid?max=1000` as the fixed archive window | User-approved coverage contract |
| D8 | Upstream nullability and in-scope narrowing must be separated explicitly; `duration` is non-null in this podcast-only scope and `descriptionHtml` is deleted | Semantic ambiguity is resolved up front |

## 7. Affected Methods / Types

### Cloud API

- `apps/cloud-api/discovery.go`
  - discovery route constants / route dispatch
- `apps/cloud-api/discovery_podcastindex.go`
  - PI auth/request path reuse
  - new upstream response structs for `episodes/byitunesid`
  - new relay DTOs and mapping helpers
  - new handler for cloud discovery episode retrieval by podcast iTunes ID

### Cloud UI

- `apps/cloud-ui/src/lib/discovery/schema.ts`
- `apps/cloud-ui/src/lib/discovery/cloudApi.ts`
- `apps/cloud-ui/src/lib/discovery/index.ts` or equivalent export surface
- `apps/cloud-ui/src/lib/discovery/podcastQueryContract.ts`
- `apps/cloud-ui/src/lib/discovery/queryCache.ts`
- `apps/cloud-ui/src/lib/discovery/feedCache.ts`
- `apps/cloud-ui/src/lib/discovery/episodeCache.ts` or the renamed replacement module
- `apps/cloud-ui/src/routeComponents/podcast/PodcastShowPage.tsx`
- `apps/cloud-ui/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
- `apps/cloud-ui/src/hooks/useEpisodeResolution.ts`
- nearby changed-zone tests using RSS-derived episode fixtures

## 8. Required Changes

### Scope Boundary

This instruction owns:

- replacing RSS-backed page-rendering episode data with PI-backed episode data
- introducing the backend relay route for PI episodes by podcast iTunes ID
- redefining the frontend canonical episode schema away from RSS naming/ownership
- moving page episode cache/query ownership from the legacy feed field to `podcastItunesId`
- removing frontend feed fetch/query/cache capability for podcast content pages
- removing RSS participation from show page, episodes page, and episode detail resolution

This instruction does not own:

- deleting RSS support for non-page side-channel features
- redesigning subscription/favorite/download persistence identifiers
- changing podcast route identity
- changing Apple search/editor-pick sourcing
- broad lite-app refactors outside the Cloud instruction stream

### A. Add a PI episode relay route owned by podcast iTunes ID

Add a Cloud API route dedicated to episode retrieval by canonical podcast identity.

Required contract:

- internal cloud route should be podcast-keyed, not feed-keyed
- preferred shape:
  - `GET /api/v1/discovery/podcasts/:itunesId/episodes`
- required query ownership:
  - canonical identifier input = route `:itunesId`
  - `max` must be normalized and validated explicitly
  - page-rendering callers use a fixed `max=1000`

Required backend behavior:

1. validate `itunesId` using the same normalized positive-decimal contract as the existing podcast detail route
2. reuse the existing PodcastIndex auth/config/request path
3. call upstream `GET /api/1.0/episodes/byitunesid` with `max=1000` for page-rendering consumers
4. map upstream payload into a relay-owned internal DTO; do not expose raw PI field names unless the internal contract deliberately chooses them
5. emit standard discovery error mapping/logging/rate-limiting behavior

### B. Define a new canonical internal episode contract

The frontend must no longer treat RSS-derived `FeedEpisodeSchema` as the canonical page-rendered episode model.

Required naming/action:

- replace or rename the canonical page-rendering schema/type to a neutral or PI-owned name such as:
  - `PodcastEpisodeSchema`
  - `PIEpisodeSchema`
- do not keep `FeedEpisodeSchema` as the authoritative page type if the source is no longer RSS

The instruction must define the upstream-vs-internal boundary explicitly.

Upstream PI fields that need classification:

- raw PI identity/source fields:
  - `guid`
  - `feedItunesId`
  - PI numeric `id`
- raw PI content fields:
  - `title`
  - `description`
  - `link`
  - `datePublished`
  - `enclosureUrl`
  - `enclosureLength`
  - `duration`
  - `episode`
  - `season`
  - `episodeType`
  - `explicit`
  - `image`
  - `transcriptUrl`
  - `chaptersUrl`

Required upstream schema classification:

- upstream required in the official schema:
  - `id`
  - `title`
  - `link`
  - `description`
  - `guid`
  - `datePublished`
  - `datePublishedPretty`
  - `dateCrawled`
  - `enclosureUrl`
  - `enclosureType`
  - `enclosureLength`
  - `explicit`
  - `image`
  - `feedImage`
  - `feedId`
  - `feedLanguage`
  - `feedDead`
  - `duration`
- upstream nullable in the official schema:
  - `duration`
  - `episode`
  - `episodeType`
  - `season`
  - `feedItunesId`
  - `feedDuplicateOf`
  - `chaptersUrl`
  - `transcriptUrl`
- upstream optional / may not be reported:
  - `transcripts`
  - `soundbite`
  - `soundbites`
  - `persons`
  - `socialInteract`
  - `value`

Required implementation rule:

- the relay and frontend schema must follow the official upstream required/nullable/optional split explicitly
- do not describe these fields as “missing sometimes” in generic terms when the upstream schema already defines whether they are required, nullable, or optional
- internal contract narrowing is allowed only when it is justified by explicit product scope and encoded deliberately, not by assumption

Required in-scope narrowing classification:

- upstream nullable but narrowed to non-null in this podcast-only scope because the official docs tie nullability to `liveItem` and `liveItem` is out of scope:
  - `duration`
- do not automatically narrow other nullable fields unless the official schema note and product scope justify it explicitly
- if execution chooses to narrow any additional field beyond `duration`, the instruction implementation notes and tests must cite the exact upstream schema rationale

Required normalized internal contract decisions:

1. canonical episode identity remains `episodeGuid`
2. audio source field remains one internal key, not mixed `audioUrl`/`enclosureUrl` usage
3. publication time must normalize deterministically from PI raw data
4. explicitness must normalize from PI numeric flags into one internal boolean contract
5. optional transcript/chapters ownership must be explicit
6. description contract is plain-text-only; `descriptionHtml` must be removed from the canonical page-rendering episode schema

Required owner classification:

- `descriptionHtml` is delete-safe residue and must be removed from the page-rendering episode contract
- any field kept only because old tests mention it must be deleted or reclassified explicitly
- any raw PI-only numeric/string alias must not leak through the schema just to keep fixtures green

### C. Verify and lock semantic conversions before implementation completes

The implementation must encode the following already-approved semantic conversions explicitly rather than leaving them implicit in UI code:

1. **Duration**
  - upstream schema declares `duration: integer | null`
  - PI documents the unit as seconds
  - this product scope narrows `duration` to non-null because live items are excluded
  - backend relay, frontend schema, and tests must encode that narrowing deliberately
2. **Publication date**
  - PI `datePublished` is numeric epoch-style data
  - normalize it into one parseable internal date representation used consistently by all content pages
3. **Description mode**
  - page-rendering episode description is plain-text-only
  - `descriptionHtml` must be deleted, not preserved as optional compatibility residue
4. **Episode ordering**
  - the PI relay preserves upstream order as canonical order for show/episodes/detail flows

No merge is allowed if any of these semantics remain undocumented or only accidentally enforced.

### D. Replace `feedCache` with a podcast-keyed JSON `episodeCache`

Current content-page cache/query ownership is feed-shaped. That must change.

Required outcomes:

1. page-rendered episode list/query keys are keyed by `podcastItunesId`, not legacy feed transport metadata
2. `feedCache` must be removed or renamed out of page-rendering ownership; the new canonical cache is `episodeCache`
3. the new cache stores JSON episode payloads returned from the PI relay, not parsed RSS XML artifacts

Required code review focus:

- `podcastQueryContract.ts`
- `queryCache.ts`
- `feedCache.ts`
- `episodeCache.ts`

Required rule:

- do not keep `feedCache` as the hidden canonical content source while merely swapping out the fetch function underneath it
- page-rendering canonical cache ownership must be `episodeCache` keyed by `podcastItunesId`

### E. Cut show page over to PI episodes, not RSS feed pages

`PodcastShowPage` must stop calling the RSS-backed feed route for the visible episode list and description source.

Required behavior:

1. podcast metadata still comes from `getPodcastIndexPodcastByItunesId`
2. visible episode list comes from the new PI episode relay
3. show description is owned only by `podcasts/byitunesid.description`
4. no feed-level summary fallback or compatibility branch may remain
5. page loading/error/empty states must be based on podcast lookup + PI episode lookup, not feed fetch state

### F. Cut episodes page over to PI episodes with fixed `max=1000` coverage

`PodcastEpisodesPage` must stop paginating RSS feed slices.

Required behavior:

1. the episodes page uses the new PI episode relay as its sole page-rendering episode source
2. the route requests `max=1000`
3. `episodeCache` stores that full `max=1000` JSON result as one podcast-keyed canonical payload
4. the UI must not preserve RSS-style feed-page slicing or infinite-scroll assumptions if the new product contract is “up to 1000 episodes from PI”

### G. Cut episode detail resolution over to PI episode ownership only

`useEpisodeResolution` and `PodcastEpisodeDetailPage` must no longer read RSS data for episode resolution.

Required behavior:

1. resolve the podcast via `podcasts/byitunesid`
2. resolve the episode from PI-backed `episodeCache` / PI JSON payloads owned by `podcastItunesId`
3. cold-open detail routes must request `episodes/byitunesid?max=1000`
4. if the target `episodeGuid` is absent from that result set, return the deterministic `episodeNotFound` path directly

Forbidden shortcut:

- no RSS fetch fallback
- no feed-keyed exact-episode recovery path
- no route identity fallback to raw PI numeric episode `id`

### H. Remove legacy feed transport metadata from active ownership

After this cutover, legacy feed transport metadata is only tolerated in historical or transitional contexts, never as active page-rendering input:

- historical persistence cleanup notes
- transitional audit documentation
- explicit negative test examples only

After this cutover, legacy feed transport metadata is not allowed for:

- show page episode list rendering
- episodes page archive rendering
- episode detail lookup / hydration
- show-page summary ownership unless that summary is deliberately still podcast-metadata-owned and comes from `podcasts/byitunesid`

Frontend contract after this cutover:

- the frontend does not retain feed-query capability for podcast content rendering
- no frontend helper, query key, cache, or test should treat legacy feed transport metadata as a page-rendering fetch authority
- if feed-fetch code still temporarily exists elsewhere during the transition, content-page flows must not call it and changed-zone tests must not preserve it

### I. Rewrite changed-zone tests and fixtures so they stop preserving RSS ownership

Changed-zone tests must stop implying that RSS is the canonical source.

Required backend tests:

- PI episode relay success payload mapping
- PI episode relay invalid `itunesId`
- PI episode relay upstream failure mapping
- PI episode relay required/nullable field mapping aligned with the official schema
- PI episode relay product-scope narrowing coverage for `duration` non-null in podcast-only payloads
- semantic conversion coverage for:
  - duration
  - publication date
  - explicit flag
  - transcript/chapters optionality

Required frontend tests:

- show page renders episodes from PI relay, not `fetchPodcastFeed`
- episodes page requests and renders the `max=1000` PI result contract without RSS-style feed pagination ownership
- `episodeCache` stores one podcast-keyed full JSON payload rather than feed-page slices
- episode detail direct-entry resolves from PI-backed episode data only
- episode detail cold-open uses `max=1000` and returns `episodeNotFound` when the target `episodeGuid` is absent
- show page description renders only `podcasts/byitunesid.description`
- schema tests assert the official required/nullable split and the in-scope narrowing rule, including `duration`, `episode`, `episodeType`, `season`, `chaptersUrl`, and `transcriptUrl`
- empty/error states reflect PI episode lookup outcomes, not RSS feed errors
- changed-zone tests no longer validate frontend feed-query keys, feed-cache promotion, or feed-fetch retry behavior for podcast content pages

Required fixture cleanup:

- changed-zone fixtures must stop carrying RSS-only fields such as `descriptionHtml`
- changed-zone tests must stop importing or asserting `FeedEpisode` as the canonical page-rendering type
- tests must stop anchoring canonical caches on legacy feed transport metadata when they are exercising page-rendering content flows
- obsolete frontend feed-query / feed-cache tests should be deleted rather than retained as dormant compatibility coverage

## 9. Forbidden Outcomes

- No continued RSS fetch in show/episodes/detail render paths
- No keeping `FeedEpisodeSchema` as canonical page contract solely for compatibility inertia
- No feed-keyed canonical content cache hidden behind renamed helpers
- No retaining `feedCache` as the page-rendering cache owner
- No retained frontend feed-query/feed-cache test coverage for content-page behavior
- No raw PI DTO pass-through as the frontend contract
- No using PI numeric episode `id` or legacy feed transport metadata as route identity
- No preserving `descriptionHtml`
- No preserving `FeedEpisode` as the canonical page-rendering type name in changed-zone code/tests
- No using any archive coverage other than the approved `max=1000` window for content pages
- No fabricating `descriptionHtml` just to preserve old UI code paths
- No unit ambiguity on `duration` or `datePublished`

## 10. Verification Plan

### Required Automated Verification

- `go test ./...` in `apps/cloud-api`
- changed-zone Cloud UI tests covering:
  - `PodcastShowPage`
  - `PodcastEpisodesPage`
  - `PodcastEpisodeDetailPage`
  - `useEpisodeResolution`
  - discovery schema validation
- `pnpm -C apps/cloud-ui lint`
- `pnpm -C apps/cloud-ui exec tsc --noEmit`

### Required Manual Verification

1. Open a show page and confirm the visible episode list loads without any RSS feed request owning the render path.
2. Open the episodes page and confirm it uses the PI `max=1000` dataset rather than feed-page pagination.
3. Open an episode detail route directly and confirm it resolves from PI-backed episode data without RSS fallback, and shows `episodeNotFound` when the target is outside the returned 1000-item set.
4. Confirm the show-page description comes only from `podcasts/byitunesid.description`.
5. Trigger a PI episode lookup failure and confirm the page surfaces the new deterministic error/empty behavior rather than a feed-fetch-derived state.
6. Validate subscription/favorite/download flows no longer require legacy feed transport metadata.

## 11. Acceptance Criteria

- [x] show page, episodes page, and episode detail page no longer use RSS feed data for page rendering
- [x] Cloud API exposes a podcast-keyed PI episode relay route backed by `/episodes/byitunesid`
- [x] canonical frontend episode schema is redefined away from RSS-owned `FeedEpisode` semantics
- [x] page episode cache ownership is implemented as JSON `episodeCache` keyed by `podcastItunesId`
- [x] frontend no longer retains feed fetch/query/cache capability for podcast page-rendering flows
- [x] legacy feed transport metadata is no longer part of the active repo-owned runtime contract
- [x] duration/date/description semantics follow the approved PI contract: `duration` narrowed to non-null in podcast-only scope, normalized date, plain-text-only description
- [x] direct-entry episode detail behavior is deterministic under the approved `max=1000` coverage contract
- [x] changed-zone tests and fixtures no longer preserve RSS page ownership by inertia, including removal of `FeedEpisode`, `descriptionHtml`, and frontend feed-query/feed-cache expectations

## 12. Completion

- **Completed by**: Codex
- **Commands**:
  - `go test ./...` (in `apps/cloud-api`)
  - `pnpm -C apps/cloud-ui exec tsc --noEmit`
  - `pnpm -C apps/cloud-ui lint`
  - `pnpm -C apps/cloud-ui exec vitest run src/routeComponents/podcast/__tests__/PodcastShowPage.editorPick.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.editorPick.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx src/routeComponents/podcast/__tests__/PodcastRouteErrorClassification.test.tsx src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.refresh.test.tsx`
- **Date**: 2026-05-01
- **Reviewed by**: Readio Reviewer (QA)
