# Discovery And PI Contract

Go discovery relay, PI DTO/schema ownership, frontend discovery contracts, and episode-list source semantics.

Findings in this file keep their original audit numbering.

Only the checklist-linked findings below are active execution scope for workers in the current pass. Other finding bodies in this file remain as reference history and should not be scheduled unless explicitly promoted later.

## Worker Checklist

- [x] Correctness pass A1: harden Go PI relay validation and canonical emitted DTO semantics. Findings: `1`, `6`, `16`, `74`
- [x] Correctness pass A2: finish canonical discovery identity and query-contract cleanup. Findings: `7`, `25`, `84`, `86`, `87`, `88`, `89`
- [x] Verification pass A3: tighten tests and fixtures that still protect malformed canonical DTOs or raw positional query-key knowledge. Findings: `13`, `104`, `106`, `108`, `109`
- [x] Optional cleanup after A1-A3 are green: finish leftover naming / decoder narrowing cleanup and remove legacy route-state residue. Findings: `56`, `75`, `90`, `91`
- [x] Exit criteria: show page, episodes page, and detail page all resolve from PI-first canonical `podcastItunesId + guid` data without RSS/feed fallback or legacy route-state dependence

## Reference Findings

### 1. Go discovery contract hardening

Priority: must fix

- PI top-level `status` is not modeled or validated in the Podcast Index relay path.
  - affected: `apps/cloud-api/discovery_podcastindex.go`
  - risk: relay can accept and serve PI payloads even when upstream marks them failed
- batch-by-guid can emit invalid canonical identity such as `podcastItunesId = "0"`.
  - affected: `apps/cloud-api/discovery_podcastindex.go`
  - risk: invalid canonical IDs enter downstream contracts
- single-podcast lookup does not reject upstream `itunesId` mismatch.
  - affected: `apps/cloud-api/discovery_podcastindex.go`
  - risk: route identity can be silently relabeled with requested path ID
- malformed reserved paths such as `/api/v1/discovery/podcasts/episodes` currently fall into `INVALID_ITUNES_ID` instead of `NOT_FOUND`.
  - affected: `apps/cloud-api/discovery.go`
- minor Go-side residue still exists in raw PI decode structs and comments.
  - examples: unused raw fields, stale inline contract comments

### 2. Frontend discovery contract alignment

Priority: must fix

- frontend episode-list fetch no longer explicitly encodes the fixed `max=1000` PI contract.
  - affected: `apps/cloud-ui/src/lib/discovery/cloudApi.ts`
  - related: `apps/cloud-ui/src/lib/discovery/podcastQueryContract.ts`
  - related docs/tests are out of sync with the intended contract
- discovery fixtures still bypass schema strictness with cast-based test data.
  - affected: `apps/cloud-ui/src/lib/discovery/__tests__/fixtures.ts`
  - risk: tests stop exercising the real PI wire contract

Priority: already reviewed and intentionally rejected

- do not rename public type aliases from `Podcast` / `Episode` to `PIPodcast` / `PIEpisode`

### 6. Go relay semantics and DTO discipline

Priority: must fix

- malformed PI podcast payloads are currently downgraded into successful `null` or silently dropped rows instead of being treated as invalid upstream data.
  - affected: `apps/cloud-api/discovery_podcastindex.go`
  - related cache semantics: `apps/cloud-api/discovery.go`
  - risk: malformed upstream payloads can be cached as success/null
- PI podcast artwork is not normalized to the same canonical URL standard used by other discovery DTOs.
  - affected: `apps/cloud-api/discovery_podcastindex.go`
- PI podcast `genres` ordering is nondeterministic because categories are decoded from a map and emitted without sorting.
  - affected: `apps/cloud-api/discovery_podcastindex.go`

Priority: cleanup

- some human-readable PI error messages still talk about query parameters even when the value comes from a path segment or POST body.
- batch GUID parsing does not currently verify EOF after the JSON array payload.
- PI request building does not clearly inherit the shared discovery default user agent when the dedicated PI env var is unset.

### 7. Frontend contract and schema-boundary discipline

Priority: must fix

- invalid route-country handling is inconsistent at the canonical page boundary.
  - affected route files: `apps/cloud-ui/src/routes/podcast/$country/$id/index.tsx`, `apps/cloud-ui/src/routes/podcast/$country/$id/episodes.tsx`, `apps/cloud-ui/src/routes/podcast/$country/$id/$episodeKey.tsx`
  - affected resolver: `apps/cloud-ui/src/hooks/useEpisodeResolution.ts`
  - risk: invalid content-route country can strand the detail page in loading state instead of failing closed
- editor-pick route state still bypasses schema validation.
  - affected: `apps/cloud-ui/src/lib/discovery/editorPicks.ts`
  - current behavior: any object with a non-empty `podcastItunesId` is cast to `EditorPickPodcast`
  - risk: route state becomes a privileged unvalidated bridge into canonical PI bootstrap
- shared discovery fixtures still bypass the schema contract with invalid timestamps and `as Episode` / `as SearchEpisode` casts.
  - affected: `apps/cloud-ui/src/lib/discovery/__tests__/fixtures.ts`
  - risk: tests no longer exercise the real wire contract
- the fixed PI page-rendering window is still not encoded as an explicit request parameter and cache-contract token.
  - affected: `apps/cloud-ui/src/lib/discovery/cloudApi.ts`
  - affected: `apps/cloud-ui/src/lib/discovery/podcastQueryContract.ts`

Priority: should fix

- editor-pick bootstrap logic is split across multiple consumers instead of one schema-validating helper.
  - affected: `apps/cloud-ui/src/lib/discovery/editorPicks.ts`
  - affected consumers: show/detail/episodes bootstrap paths
- country identity is not normalized consistently before discovery query-key construction.
  - affected areas include search hooks, discovery podcast hooks, editor-pick keys, podcast detail keys, and explore-store country bootstrap
  - risk: equivalent countries such as `US` and `us` can occupy parallel cache/request lanes

Priority: cleanup

- some discovery handoff docs still use deleted field names such as `episodeUrl` and `episodeGuid` where the active frontend contract now uses `audioUrl` and `guid`.

### 13. Schema bypass is broader than the shared discovery fixtures

Priority: should fix

- downstream tests across hooks, route components, and player logic still instantiate `Episode` or `Podcast` objects that violate the active schema contract.
  - examples include invalid `pubDate` formats such as RFC822 strings or date-only strings
  - examples include empty required `Podcast` fields where runtime schema requires non-empty strings and valid HTTP URLs
  - sample affected tests:
    - `apps/cloud-ui/src/hooks/__tests__/useEpisodePlayback.transcript.test.ts`
    - `apps/cloud-ui/src/hooks/__tests__/useEpisodePlayback.surface.test.ts`
    - `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
  - risk: downstream tests stop reflecting the actual PI-owned type contract even when the schema itself is strict

Priority: cleanup

- some downstream test names and comments still use stale “feed episode” wording even after the feed-owned rendering chain was deleted.

### 16. Some cloud-api tests still lock in rejected behavior

Priority: should fix

- `cloud-api` tests do not only miss the desired PI validation behavior; some of them explicitly preserve the current wrong semantics as passing behavior.
  - sample affected area: `apps/cloud-api/discovery_test.go`
  - example: tests that assert PI podcast lookup currently ignores upstream `status`
  - risk: even after implementation is corrected, stale tests will push the code back toward permissive relay behavior

Priority: cleanup

- some test names and comments still preserve outdated ownership wording even when the asserted payload shape has already been updated.

### 25. Podcast detail cache is over-partitioned by country

Priority: should fix

- the frontend `podcast-detail` query key still includes `country` even though the actual canonical lookup request is only `/podcasts/:itunesId` and does not consume country at all.
  - affected: `apps/cloud-ui/src/lib/discovery/podcastQueryContract.ts`
  - affected call path: `apps/cloud-ui/src/lib/discovery/queryCache.ts`
  - affected consumers: show page, episodes page, detail resolution, and related tests
  - risk:
    - the same canonical podcast detail payload is duplicated across multiple country partitions
    - cache reuse is reduced for no domain benefit
    - route-country churn can create unnecessary refetches of country-independent data

### 26. Some public discovery/storage APIs still force transport-shaped callers

Priority: cleanup

- some helper signatures still ask callers for parameters that belong to cache topology or legacy storage mechanics rather than the domain operation itself.
  - examples:
    - `ensurePodcastDetail(queryClient, podcastItunesId, country, signal)` even though country does not affect the actual fetch payload
    - favorite repository methods centered on derived `key`
  - risk: public API shape keeps leaking implementation-specific partitioning/identity decisions into otherwise simple domain call sites

### 56. Backend/cache naming still preserves the old “archive” mental model for the PI episode list payload

Priority: cleanup

- some backend constants/helpers and related tests still refer to the `episodes/byitunesid` payload as an “archive”, even though RSS/feed archive semantics were intentionally removed from the architecture.
  - affected:
    - `apps/cloud-api/discovery_podcastindex.go`
    - `apps/cloud-api/discovery_podcastindex_episodes_test.go`
    - `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
  - current behavior:
    - backend cache sizing still uses names like `podcastIndexArchiveCacheMax` and `estimatePodcastEpisodeArchiveSize(...)`
    - tests still use helpers like `mockPodcastAndArchive(...)`
  - problems:
    - the codebase is still teaching future readers that the canonical episode list is an “archive” artifact
    - the naming no longer matches the current product/data-source model of “PI episode list”
    - this increases the chance that future work reintroduces feed/archive assumptions by vocabulary drift alone
  - risk: even when runtime behavior is correct, stale architecture language keeps the refactor mentally unfinished and makes later design/maintenance decisions noisier

### 74. The PI `episodes/byitunesid` mapping path still uses mixed fail-open and fail-closed validation semantics for canonical episode rows

Priority: should fix

- now that PI episode lists are the sole page-rendering source, the backend mapping contract is still inconsistent about which upstream row defects are considered fatal versus silently skippable.
  - affected:
    - `apps/cloud-api/discovery_podcastindex.go`
    - `apps/cloud-api/discovery_podcastindex_episodes_test.go`
  - current behavior:
    - `mapPodcastIndexEpisodeToPIEpisode()` silently skips rows for missing `title/guid/datePublished/duration`, invalid `link`, missing usable artwork, or mismatched `feedItunesId`
    - the handler deduplicates by GUID and simply continues after `errSkipPodcastIndexEpisode`
    - in contrast, an invalid canonical audio URL (`enclosureUrl`) fails the entire route with `UPSTREAM_INVALID_RESPONSE`
    - tests actively codify this mixed policy: some malformed rows are expected to disappear, while others are expected to hard-fail the endpoint
  - problems:
    - the canonical episode-list contract is no longer “all rows satisfy the page contract or the upstream payload is invalid”; instead it is a hybrid of strict and best-effort behavior
    - because the frontend no longer has RSS fallback, silently dropped rows can now surface as unexplained missing episodes or `episodeNotFound` outcomes
    - the distinction between “fatal canonical corruption” and “safe to ignore noise” is not expressed as a clear policy, only as scattered mapping branches
  - risk: data-loss-style regressions can hide behind successful 200 responses, making PI payload issues harder to diagnose and weakening confidence in the sole-source episode pipeline

### 75. The PI upstream decoder surface is still wider than the actually used canonical contract

Priority: cleanup

- the backend has already narrowed the emitted podcast/episode DTOs significantly, but the upstream decode structs still retain fields that no longer participate in validation, mapping, or business logic.
  - affected:
    - `apps/cloud-api/discovery_podcastindex.go`
  - current behavior:
    - `podcastIndexPodcastFeed` still decodes `url`
    - `podcastIndexEpisodeItem` still decodes `chaptersUrl`
    - those fields are not consulted by `mapPodcastIndexPodcastToPIPodcast()` or `mapPodcastIndexEpisodeToPIEpisode()`, and they do not appear in the emitted cloud DTOs
  - problems:
    - the apparent PI contract surface is larger than the code’s actual ownership surface
    - dead parsed fields make it harder to see which upstream fields are truly authoritative for first-release rendering behavior
    - future maintainers can easily misread these structs as a supported/validated contract rather than a partially narrowed decoder
  - risk: contract cleanup work stays noisier than necessary, and dead field drift remains easy to reintroduce because the decoder structs still advertise unused data as if it mattered

### 84. Canonical episode-route assembly is still duplicated across multiple modules instead of being owned by one route helper

Priority: cleanup

- the app still rebuilds the same canonical `country + podcastItunesId + episodeGuid -> compact route` rule in several places, with each caller carrying its own trimming, fallback, and helper choices.
  - affected:
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
    - `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
    - `apps/cloud-ui/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
    - `apps/cloud-ui/src/lib/routes/episodeResolver.ts`
    - `apps/cloud-ui/src/lib/discovery/editorPicks.ts`
  - current behavior:
    - `episodeRowModel`, `localSearchActions`, and `DownloadsPage` each locally perform `guid -> compact key -> buildPodcastEpisodeRoute(...)`
    - some paths call `buildEpisodeCompactKey(...)`, while others call `episodeIdentityToCompactKey(...)` through a different helper layer
    - each caller independently decides how to trim/normalize country, podcast id, and guid, and what fallback to return on invalid input
  - problems:
    - one canonical route contract is spread across UI, business-action, and detail-page code instead of being owned by one adapter
    - compact-key encoding and route-shape decisions can drift subtly across call sites even when they are supposed to mean the same thing
    - the current structure makes it hard to tell which helper is authoritative versus which ones are just local rewrites
  - risk: future changes to episode-key encoding or canonical route rules will require synchronized edits across many surfaces, increasing the chance that only some navigation entry points stay correct

### 86. PI episode-list authority is still serialized into positional string tokens and reparsed from query-key offsets

Priority: cleanup

- the frontend cache layer is still expressing episode-list authority through ad hoc query-key token strings and then decoding those strings back into structured authority later.
  - affected:
    - `apps/cloud-ui/src/lib/discovery/podcastQueryContract.ts`
    - `apps/cloud-ui/src/lib/discovery/episodeCache.ts`
    - `apps/cloud-ui/src/lib/discovery/__tests__/podcastQueryContract.test.ts`
    - `apps/cloud-ui/src/lib/discovery/__tests__/episodeCache.test.ts`
  - current behavior:
    - `buildPodcastEpisodesQueryKey(...)` expands authority into positional tokens like `lut-42` and `count-7`
    - `episodeCache.ts` later reconstructs authority by reading `queryKey[4]` and `queryKey[5]` and parsing those string prefixes back into numbers
    - the authority concept is therefore modeled once as a logical object and again as an implicit token grammar
  - problems:
    - one cache contract is split across a builder and a parser instead of being carried as one shared structured key segment
    - cache correctness now depends on token order, exact prefixes, and positional offsets that are not enforced by the type system
    - adding or changing authority dimensions would require synchronized edits across token construction, token parsing, cache scans, and tests
  - risk: authority matching and bootstrap behavior can drift silently if key encoding changes in one place, and the resulting cache design remains harder to understand than a single structured authority contract

### 87. Canonical podcast content routes still bypass the shared query-cache helpers and each reassemble resource loading locally

Priority: cleanup

- the app already has shared imperative loaders for canonical podcast detail and PI episode lists, but the content-route entry points still rebuild those resource-loading rules themselves with local `useQuery` orchestration.
  - affected:
    - `apps/cloud-ui/src/lib/discovery/queryCache.ts`
    - `apps/cloud-ui/src/routeComponents/podcast/PodcastShowPage.tsx`
    - `apps/cloud-ui/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
    - `apps/cloud-ui/src/hooks/useEpisodeResolution.ts`
  - current behavior:
    - `queryCache.ts` exports `ensurePodcastDetail(...)` and `ensurePodcastEpisodes(...)` as the shared cache-aware content loaders
    - `PodcastShowPage`, `PodcastEpisodesPage`, and `useEpisodeResolution()` still each construct their own `useQuery` with `buildPodcastDetailQueryKey(...)`
    - those same entry points also each separately wire `getPodcastEpisodesBootstrapSnapshot(...)`, `buildPodcastEpisodesQueryKey(...)`, and `readOrFetchPodcastEpisodes(...)`
    - route-specific bootstrap concerns such as editor-pick initial data are layered directly into those callers instead of being owned by one content-resource adapter
  - problems:
    - the canonical podcast-page loading contract is spread across multiple pages/hooks instead of being owned by one resource layer
    - changes to cache key shape, authority policy, bootstrap semantics, or detail-fetch normalization require synchronized edits in several route entry points
    - the existence of shared query helpers is misleading because the most important route surfaces still bypass them
  - risk: content-route behavior can drift subtly between show, episodes, and detail screens, and later cache/refactor work remains more invasive than necessary because one domain load path still has multiple owners

### 88. `PodcastShowPage` still mixes requested route id and canonical podcast id when building episode navigation

Priority: should fix

- the show page resolves a canonical podcast id for some navigation affordances, but still forces episode-row links to use the raw requested route id.
  - affected:
    - `apps/cloud-ui/src/routeComponents/podcast/PodcastShowPage.tsx`
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
  - current behavior:
    - `PodcastShowPage` computes `canonicalPodcastId = getCanonicalEditorPickPodcastID(podcast) || id`
    - the "See all" route is built with `canonicalPodcastId`
    - the episode preview rows still render `<EpisodeRow ... podcastId={id} />`
    - `fromEpisode()` explicitly prefers the passed `podcastId` over the canonical id derived from `podcast`
  - problems:
    - one screen is exposing two different podcast-id authorities for adjacent episode navigation affordances
    - if the requested route id ever differs from the fetched canonical id, preview rows and the "See all" button can lead into different canonical spaces
    - the row-model helper is being given a less authoritative id even when the page has already resolved a stronger canonical one
  - risk: navigation consistency on the show page depends on route-id correctness leaking in from outside, and the page is structurally prepared to fork episode navigation even after authoritative podcast resolution has already happened

### 89. Podcast show and episodes pages still do not replace-navigate onto canonical podcast ids after authoritative lookup

Priority: should fix

- unlike the detail page, the show and episodes pages never rewrite the URL onto the fetched canonical podcast id after authoritative PI lookup succeeds.
  - affected:
    - `apps/cloud-ui/src/routeComponents/podcast/PodcastShowPage.tsx`
    - `apps/cloud-ui/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
    - `apps/cloud-ui/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
  - current behavior:
    - `PodcastEpisodeDetailPage` computes `canonicalPodcastId` and performs a `replace: true` navigate when `id !== canonicalPodcastId`
    - `PodcastShowPage` computes `canonicalPodcastId` but only uses it for downstream links
    - `PodcastEpisodesPage` keeps querying and rendering entirely under the raw route `id`
    - both show/episodes pages keep their podcast-detail and episode-list query keys keyed by the requested route id
  - problems:
    - canonicalization policy is inconsistent across adjacent content routes for the same podcast domain
    - if the authoritative podcast id ever differs from the requested id, page URL, cache ownership, and downstream links can diverge instead of converging
    - the pages that establish the podcast-level context are less canonical than the deeper detail route beneath them
  - risk: requested-id drift can linger in the show/episodes entry points, leaving content caches and browser history under a weaker identity even after authoritative podcast resolution has already happened

### 90. Editor-pick route-state parsing still carries explicit `episodeSnapshot` legacy-cleanup logic

Priority: cleanup

- the runtime editor-pick route-state parser still explicitly knows about the removed `episodeSnapshot` concept and strips it during state normalization.
  - affected:
    - `apps/cloud-ui/src/lib/discovery/editorPicks.ts`
    - `apps/cloud-ui/src/lib/discovery/__tests__/editorPicks.test.ts`
  - current behavior:
    - `getEditorPickRouteState()` reads `episodeSnapshot?: unknown` from incoming state
    - it then removes that field via destructuring before returning `{ editorPickSnapshot, ...restState }`
    - tests still codify both “strip legacy episodeSnapshot” and “reject route state when only episodeSnapshot is present”
  - problems:
    - a deleted route-state contract is still part of live parsing logic instead of being fully removed from the codebase
    - the parser and tests continue to teach future maintainers that `episodeSnapshot` is a supported or expected migration concern
    - this keeps route-state cleanup logic coupled to a concept the product has already rejected
  - risk: dead route-state concepts remain easier to reintroduce or preserve accidentally because the canonical parser still treats them as first-class historical cases

### 91. `getEpisodeGuid()` remains as an unused wide-input bridge helper in the PI discovery layer

Priority: cleanup

- the discovery editor-picks module still exports a generic “wide episode-like input” helper even though no current runtime caller uses it and the active PI-owned contracts already expose strict `.guid` fields directly.
  - affected:
    - `apps/cloud-ui/src/lib/discovery/editorPicks.ts`
    - `apps/cloud-ui/src/lib/discovery/__tests__/editorPicks.test.ts`
  - current behavior:
    - `getEpisodeGuid()` accepts `{ guid?: string | null }`
    - its only repo usages are the tests that exercise the helper itself
    - the inline comment explicitly frames it as a bridge for wide episode-like inputs, while strict `Episode` / `SearchEpisode` consumers should use `.guid` directly
  - problems:
    - the runtime module still advertises a bridge contract that no longer appears to have a real production caller
    - keeping this helper around preserves the idea that discovery surfaces still routinely accept weak episode-like objects
    - dead bridge helpers add noise when trying to understand which identifiers are actually authoritative in the PI-first architecture
  - risk: future call sites can revive a weaker identity path simply because an old bridge helper is still exported and tested as if it were part of the intended design


### 104. Discovery tests still manufacture schema-impossible PI entities outside the shared fixture layer

Priority: cleanup

- several discovery/navigation tests are still creating invalid `Episode` / `SearchEpisode` values with local casts, even after the PI-first schemas were tightened.
  - affected:
    - `apps/cloud-ui/src/lib/routes/__tests__/episodeResolver.test.ts`
    - `apps/cloud-ui/src/hooks/__tests__/useEpisodePlayback.surface.test.ts`
  - current behavior:
    - `episodeResolver.test` casts `{ guid: undefined }` into `Episode` to exercise “missing guid” behavior even though `PIEpisodeSchema` requires `guid`
    - the same test file builds episode fixtures with millisecond ISO timestamps, while the canonical page-rendering schema explicitly rejects millisecond `pubDate`
    - `useEpisodePlayback.surface.test.ts` casts partial objects into `SearchEpisode` even when required search fields such as `releaseDate`, `trackTimeMillis`, and `shortDescription` are absent
  - problems:
    - invalid-shape handling is being pushed downstream into route/playback helpers instead of being owned by the schema boundary
    - impossible nullability and missing-field branches stay regression-protected even though production PI parsing would already fail closed
    - this weakens the signal of the tests: it becomes unclear whether a branch reflects supported runtime input or only a cast-made artifact
  - risk: discovery code keeps carrying unnecessary bridge/fallback logic because the suite continues to fabricate and protect states that the real PI contracts can no longer produce


### 106. Discovery route tests still codify positional react-query key grammar instead of using shared query-contract ownership

Priority: cleanup

- several discovery/page tests mock query results by inspecting raw `queryKey[1]` array positions, so non-behavioral query-key reshapes would break large test surfaces even if runtime behavior stayed correct.
  - affected:
    - `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastRouteErrorClassification.test.tsx`
    - `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.virtualized.test.tsx`
    - `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.pagination.test.tsx`
    - `apps/cloud-ui/src/lib/routes/__tests__/episodeResolver.test.ts`
  - current behavior:
    - route/page tests branch mocked query responses on conditions like `queryKey[1] === 'podcast-detail'` and `queryKey[1] === 'episodes'`
    - resolver tests do the same inside mocked `fetchQuery(...)` implementations
    - these mocks do not go through `buildPodcastDetailQueryKey(...)`, `buildPodcastEpisodesQueryKey(...)`, or a shared query matcher helper
  - problems:
    - test stability is tied to incidental array layout rather than to the shared discovery query contract
    - runtime query-key cleanup work will have to update many unrelated tests whose real concern is page behavior, not query-key grammar
    - this duplicates cache-topology knowledge across page tests, resolver tests, and query-contract tests instead of letting one helper own it
  - risk: the discovery cache/query shape calcifies further because test coverage freezes positional key details that should remain an internal implementation choice


### 108. PI contract drift has spread beyond discovery tests into playback and row-model helper suites

Priority: cleanup

- several downstream helper tests outside the discovery folder are still fabricating PI episode/search payloads that the active schemas would reject, and some of those tests still use deleted “feed episode” wording.
  - affected:
    - `apps/cloud-ui/src/lib/player/__tests__/remotePlayback.test.ts`
    - `apps/cloud-ui/src/lib/player/__tests__/episodeMetadata.test.ts`
    - `apps/cloud-ui/src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`
  - current behavior:
    - `remotePlayback.test.ts` and `episodeMetadata.test.ts` build `Episode` fixtures with millisecond `pubDate` values like `2024-01-01T00:00:00.000Z`, even though `PIEpisodeSchema` requires second-precision UTC RFC3339
    - `episodeRowModel.test.ts` builds `Episode` rows with date-only `pubDate` strings and non-HTTP `audioUrl: 'audio'`
    - several search-row tests cast partial objects into `SearchEpisode` instead of constructing schema-valid search DTOs
    - test names such as “feed episode playback” still preserve the removed feed-era ownership language
  - problems:
    - schema-invalid PI data is still being normalized downstream in tests instead of being rejected at the schema boundary
    - presentation/playback helper suites are preserving impossible input states that production parsing is supposed to eliminate earlier
    - stale feed wording keeps signaling the wrong ownership model even where the runtime path is now PI-first
  - risk: even after discovery-layer schema hardening, downstream helper tests will keep encouraging bridge logic, invalid-input tolerance, and old mental models to survive in playback/presentation code


### 109. Explore and global-search component tests still treat empty canonical identity as a normal UI input shape

Priority: cleanup

- several UI-component tests are still asserting behavior for discovery DTOs whose canonical identity fields are empty strings, even though the active PI/Apple schemas reject those states before rendering.
  - affected:
    - `apps/cloud-ui/src/components/GlobalSearch/__tests__/SearchEpisodeItem.urlHygiene.test.tsx`
    - `apps/cloud-ui/src/components/Explore/__tests__/PodcastEpisodesGrid.urlHygiene.test.tsx`
    - `apps/cloud-ui/src/components/Explore/__tests__/EditorPickShowCard.test.tsx`
    - `apps/cloud-ui/src/lib/discovery/schema.ts`
  - current behavior:
    - `SearchEpisodeItem.urlHygiene.test.tsx` passes `guid: ''` and asserts the component falls back from episode route to show route
    - `PodcastEpisodesGrid.urlHygiene.test.tsx` passes a top-episode card with `podcastItunesId: ''` and asserts “do not navigate”
    - `EditorPickShowCard.test.tsx` passes an `EditorPickPodcast` with `podcastItunesId: ''` and asserts “no show route”
    - the active `SearchEpisodeSchema`, `TopEpisodeSchema`, and `EditorPickPodcastSchema` all require non-empty `guid` / `podcastItunesId`
  - problems:
    - these tests are preserving empty-identity defensive UI paths as if they were ordinary supported props, even though upstream schema validation is supposed to eliminate them
    - component behavior and schema-boundary ownership are drifting apart: the UI suite still models malformed discovery DTOs as first-class input cases
    - this makes it harder to simplify route-generation code because impossible identity states remain regression-protected at the component layer
  - risk: empty canonical identity keeps surviving in UI logic and tests as a tolerated pseudo-contract, prolonging fail-open behavior after the PI-first schema boundary has already become strict
