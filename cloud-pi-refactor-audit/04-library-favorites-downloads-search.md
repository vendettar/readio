# Library Favorites Downloads Search

Library/business flows around favorites, downloads, local search, command palette, and UI-facing persistence contracts.

Findings in this file keep their original audit numbering.

Only the checklist-linked findings below are active execution scope for workers in the current pass. Other finding bodies in this file remain as reference history and should not be scheduled unless explicitly promoted later.

## Worker Checklist

- [x] Correctness pass D1: move favorite and download actions from URL/key-owned behavior to canonical episode identity. Findings: `17`, `19`, `33`, `46`, `49`, `60`, `76`, `77`, `79`, `94`, `95`, `96`
- [x] Correctness pass D2: fix local-search canonical merge, dedupe, and direct-navigation behavior. Findings: `27`, `31`, `38`, `39`, `40`, `58`, `82`
- [x] Correctness pass D3: remove display-text identity and bare-GUID shortcuts from user-facing library/search surfaces. Findings: `29`, `36`, `37`, `85`
- [x] Verification pass D4: update tests still protecting malformed local rows or URL-owned fallback behavior. Findings: `50`, `107`, `110`
- [x] Optional cleanup after D1-D4 are green: low-value dead helper / wide repository API cleanup. Findings: `30`, `59`
- [x] Exit criteria: one canonical episode should not appear as multiple favorites/download/search/history entities just because URL, row id, or display title changed

## Reference Findings

### 17. Download UI and status ownership still key off URL

Priority: must fix

- download status lookup, in-flight dedupe, and downloaded badge / player download CTA logic still use normalized audio URL as their only identity key.
  - affected UI: `apps/cloud-ui/src/components/Player/PlayerDownloadAction.tsx`
  - affected service layer: `apps/cloud-ui/src/lib/downloadService.ts`
  - affected repository lookup: `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`
  - current behavior:
    - `useEpisodeStatus(...)` is keyed by `sourceIdentityUrl`
    - download idempotency is checked by normalized URL
    - in-flight dedupe is keyed by `download:${normalizedUrl}`
  - risk: UI status and dedupe behavior will still follow URL ownership even if storage and route identity are moved to canonical `podcastItunesId + episodeGuid`

Priority: cleanup

- some player UI keys still fall back to `audioUrl` when `episodeGuid` is missing.
  - affected: `apps/cloud-ui/src/components/AppShell/PlayerSurfaceFrame.tsx`, `apps/cloud-ui/src/components/AppShell/MiniPlayer.tsx`
  - impact: mostly visual/state continuity, but it continues to reinforce URL as a fallback identity outside the canonical content-route contract

### 19. Favorite repository/API surface is still key-centric

Priority: should fix

- favorite storage APIs still expose `key` as the primary app-facing control surface instead of canonical identity.
  - affected: `apps/cloud-ui/src/lib/dexieDb.ts`
  - affected: `apps/cloud-ui/src/lib/repositories/LibraryRepository.ts`
  - current API examples:
    - `getFavoriteByKey`
    - `removeFavoriteByKey`
    - uniqueness enforced through derived `key` instead of an identity-first repository method
  - risk: downstream code keeps depending on the derived string key rather than treating it as an internal storage artifact

### 27. Local search still links favorites and history by audio URL

Priority: should fix

- `useLocalSearch` explicitly collects `favorite.audioUrl` values and uses them to reverse-lookup history sessions, instead of correlating favorite and history rows by canonical remote identity.
  - affected: `apps/cloud-ui/src/hooks/useLocalSearch.ts`
  - current behavior:
    - collect `favorite.audioUrl`
    - call `DB.searchSessionsByAudioUrls(favoriteAudioUrls)`
    - merge the matching history rows into search results
  - risk: favorite/history relationship disappears or becomes incorrect when the same canonical episode rotates URLs, proxies, or restored/local sources

### 29. Downloads page groups by display title instead of canonical podcast identity

Priority: should fix

- downloaded podcast tracks are grouped by `sourcePodcastTitle` string, not by canonical `sourcePodcastItunesId`.
  - affected: `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
  - current behavior:
    - `groupByPodcast()` uses `track.sourcePodcastTitle || 'Unknown Podcast'` as the map key
    - group totals and section headings are therefore title-owned
  - risk:
    - different podcasts with the same display title collapse into one group
    - retitled podcasts can split into multiple groups even when canonical identity is unchanged
    - list organization continues to treat display text as ownership rather than presentation

### 30. Another dead single-field playback-session helper remains

Priority: cleanup

- `getPlaybackSessionsByEpisodeGuid()` appears to have no current consumer and still models `episodeGuid` as a globally meaningful standalone lookup key.
  - affected: `apps/cloud-ui/src/lib/dexieDb.ts`
  - problems:
    - no consumer was found in the current repo scan
    - it ignores `podcastItunesId`
    - it preserves the same single-field identity assumption already seen in the old short-guid helper
  - risk: dead helpers with incomplete identity semantics become future footguns if reused

### 31. Local search final merge still deduplicates remote results by URL and bare GUID instead of canonical episode identity

Priority: should fix

- `useLocalSearch` does not stop at using `favorite.audioUrl` to back-link history; its final result merge also continues to key remote rows by URL or standalone GUID.
  - affected: `apps/cloud-ui/src/hooks/useLocalSearch.ts`
  - current behavior:
    - favorites dedupe as `audio:${fav.audioUrl}`
    - history dedupe prefers `audio:${session.audioUrl}`, then falls back to `episode:${session.episodeGuid}`
    - downloads do not participate in canonical dedupe at all and fall back to per-row `item.id`
  - problems:
    - the same canonical episode can split into multiple local-search results when URL/proxy/blob identity changes
    - history rows can collide across podcasts when a fallback path reduces identity to bare `episodeGuid`
    - a downloaded episode, favorite, and history row for the same canonical episode are not guaranteed to merge because they do not share one canonical key strategy
  - risk: the search surface still behaves as if URL and single-field GUID were durable ownership primitives even after the rest of the refactor moved to `podcastItunesId + guid`

### 33. Download-service public inputs are still wider than the canonical remote episode contract

Priority: should fix

- the download service still exposes an optional-bag metadata surface even though the post-refactor remote download path is supposed to be canonical and fully identified.
  - affected: `apps/cloud-ui/src/lib/downloadService.ts`
  - current behavior:
    - `DownloadJobMetadata` keeps `countryAtSave`, `podcastItunesId`, and `episodeGuid` optional
    - `buildDownloadJobOptions()` accepts `audioUrl`, `episodeTitle`, and metadata fields as nullable/optional inputs and returns `null` on validation failure
    - only later does `normalizeDownloadRequiredFields()` reconstruct the actual required contract
  - problems:
    - the public API shape still invites partially populated callers even though the domain now expects canonical episode inputs
    - correctness depends on repetitive runtime repair instead of the type/signature preventing invalid construction
    - “invalid canonical episode” and “network error” are still partially conflated at this boundary
  - risk: the download path continues to leak a transport-shaped, nullable contract into call sites that should already be working with strict PI-owned episode identity

### 36. Search results page still assumes `guid` is globally unique in React list identity

Priority: should fix

- the search results page renders episode rows with `key={episode.guid}` instead of a canonical composite identity.
  - affected: `apps/cloud-ui/src/routeComponents/SearchPage.tsx`
  - current behavior:
    - episode result list uses only `episode.guid` as the React key
    - other nearby code paths already know the canonical identity is `podcastItunesId + guid`
  - problems:
    - two different podcasts can legally surface the same GUID string
    - React row reuse can become incorrect when duplicate GUIDs appear in one result set
    - the UI layer is still inheriting the old “GUID alone is enough” assumption
  - risk: search result rows can render stale state, toggle the wrong item, or behave nondeterministically when cross-podcast GUID collisions occur

### 37. Command palette suggestions still de-duplicate podcasts by display title text

Priority: should fix

- the global search command palette filters podcast suggestions by lowercased title text rather than canonical podcast identity.
  - affected: `apps/cloud-ui/src/components/GlobalSearch/CommandPalette.tsx`
  - current behavior:
    - `suggestions` keeps a `seen` set of `p.title.toLowerCase().trim()`
    - later podcasts with the same display title are hidden even if `podcastItunesId` differs
  - problems:
    - distinct podcasts sharing a common title collapse into one suggestion
    - the suggestions list is still using presentation text as ownership/deduplication key
    - this repeats the same display-field identity drift already seen elsewhere in downloads/list surfaces
  - risk: search suggestions can silently hide valid shows and make the command palette nondeterministic when multiple canonical podcasts share or change titles

### 38. Local search drops download-backed history rows instead of merging history state onto the matching download result

Priority: should fix

- `useLocalSearch` currently treats any history row with `localTrackId` as “file history”, but download-backed remote sessions can also carry `localTrackId`.
  - affected:
    - `apps/cloud-ui/src/hooks/useLocalSearch.ts`
    - `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`
    - `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
  - current behavior:
    - `useLocalSearch` collects `session.localTrackId` from all history results
    - it only merges the `history` badge into `fileResults`
    - it then removes every history result whose session has `localTrackId`
    - remote/canonical sessions are allowed to persist `localTrackId`, and downloaded-track playback actively sets that track id into player/session state
  - problems:
    - a downloaded podcast episode with history/restore state can lose its history row in search
    - no corresponding history signal is added onto the matching download row
    - the implementation is still conflating “has localTrackId” with “user-upload file”
  - risk: local search can hide real playback history for downloaded podcast episodes and misrepresent the state of canonical remote content once it has local restore context

### 39. Downloaded canonical episodes are still physically URL-owned while local search exposes them as row-owned results

Priority: should fix

- the repo still stores podcast downloads with physical uniqueness on `sourceUrlNormalized`, and local search then surfaces those download rows without canonical-episode dedupe.
  - affected:
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`
    - `apps/cloud-ui/src/hooks/useLocalSearch.ts`
  - current behavior:
    - downloads remain unique on `[sourceType+sourceUrlNormalized]`
    - each local-search download result falls back to row-owned identity (`download-${download.id}` / `item.id`)
    - no `sourcePodcastItunesId + sourceEpisodeGuid` merge happens for downloads in local search
  - problems:
    - the same canonical episode can survive as multiple stored download rows when the source URL rotates or is reproxied
    - local search then reflects those physical storage rows instead of canonical episode identity
    - this is a deeper root cause underneath the already observed local-search dedupe drift
  - risk: download/list/search surfaces keep leaking storage topology into product behavior, so one canonical episode can appear multiple times purely because its transport URL changed

### 40. Download search actions degrade a canonical episode hit into a generic `/downloads` jump

Priority: should fix

- local search already carries the full `PodcastDownload` payload, but `executeLocalSearchAction()` throws away that canonical episode identity and navigates every download result to the generic downloads page.
  - affected:
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
    - `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
    - `apps/cloud-ui/src/components/Downloads/DownloadTrackCard.tsx`
  - current behavior:
    - local-search `download` results keep full `PodcastDownload` data
    - selecting one in local search always routes to `/downloads`
    - the downloads page itself derives a canonical episode route from `sourcePodcastItunesId + sourceEpisodeGuid + countryAtSave`
    - the download card title already links to that canonical episode route
  - problems:
    - two adjacent surfaces expose the same entity with different navigation contracts
    - local search downgrades a precise canonical episode hit into a coarse list page jump
    - the search action layer is lagging behind the stronger contract already present on the downloads surface
  - risk: users lose direct resolution from search to episode detail for downloaded canonical episodes, and the app continues to behave as if downloads are list entries first and canonical episodes second

### 46. Downloads repository public surface is still row-/URL-owned despite the domain type already carrying canonical download identity

Priority: cleanup

- the public repository API for podcast downloads still centers on `trackId` and normalized URL, even though `PodcastDownloadIdentity` already models `sourcePodcastItunesId + sourceEpisodeGuid + countryAtSave`.
  - affected:
    - `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`
    - `apps/cloud-ui/src/lib/db/types.ts`
  - current behavior:
    - lookup entry points are `getTrackSnapshot(trackId)` and `findTrackByUrl(normalizedUrl)`
    - mutation/export entry points are also track-id centric
    - there is no repository method to resolve a downloaded episode by canonical identity
  - problems:
    - upper layers that know the canonical episode identity still cannot ask the repository for “the download for this episode” directly
    - repository consumers are pushed toward physical row ids or transport URL ownership
    - the repo API shape lags behind the domain model already declared in `PodcastDownloadIdentity`
  - risk: storage topology continues to leak through the public boundary, making canonical download behavior harder to implement consistently across search, player, export, and restore flows


### 49. Favorites created from downloads/history are still snapshot-owned, not canonical-episode-owned

Priority: should fix

- the favorite mappers for downloaded tracks and playback sessions still derive favorite content from local/session snapshots instead of a canonical PI episode contract.
  - affected:
    - `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
  - current behavior:
    - `mapPodcastDownloadToFavoriteInputs()` writes `audioUrl: track.sourceUrlNormalized` and `pubDate: new Date(track.downloadedAt).toISOString()`
    - `mapPlaybackSessionToFavoriteInputs()` writes `audioUrl: session.audioUrl`, `title: session.title`, and `pubDate` from session snapshot
    - downstream row models then keep using `favorite.audioUrl` to build download/playback args
  - problems:
    - a favorite created from a download/history row is not guaranteed to preserve canonical episode metadata; it preserves whatever storage/session snapshot happened to be present
    - the same episode favorited from canonical discovery vs from download/history can persist different payload shapes
    - favorite content is still partially transport-/session-owned even though favorite identity itself was already migrated to `podcastItunesId + episodeGuid`
  - risk: favorites continue to act as a mixed canonical/snapshot artifact, so later playback, download, and display behavior can drift depending on which surface originally created the favorite

### 50. Test coverage still actively codifies URL-owned playback/session/transcript identity

Priority: cleanup

- several tests still assert URL-based lookup/identity behavior as the intended contract, which makes future canonical-identity refactors harder to land safely.
  - affected:
    - `apps/cloud-ui/src/lib/__tests__/dbOperations.test.ts`
    - `apps/cloud-ui/src/hooks/__tests__/useSession.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/remoteTranscript.identity.test.ts`
    - `apps/cloud-ui/src/store/__tests__/playerStore.restore-local-download.test.ts`
  - current behavior:
    - `dbOperations.test` explicitly tests `findLastSessionByUrl()`
    - `useSession.test` asserts remote session reuse/persistence through `DB.findLastSessionByUrl(...)`
    - `remoteTranscript.identity.test` explicitly defines ASR identity as `originalAudioUrl || audioUrl`
    - local-download restore tests are built around matching downloads back to remote sessions by `sourceUrlNormalized`
  - problems:
    - the test suite is not only tolerating URL-owned identity, it is documenting it as correct behavior
    - future canonical-identity cleanup will have to fight test fixtures/assertions before it can change runtime code
    - this increases the chance that old URL-centric assumptions survive simply because they are heavily regression-protected
  - risk: test coverage becomes an inertia source for the very transport-owned contracts the refactor is trying to eliminate


### 58. Local search view models still leak raw storage rows instead of exposing action-ready domain results

Priority: should fix

- the local-search contract still stores raw persistence entities in `LocalSearchResult.data`, forcing downstream action code to recover intent through runtime casts and storage-shape branching.
  - affected:
    - `apps/cloud-ui/src/hooks/useLocalSearch.ts`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
  - current behavior:
    - `LocalSearchResult.data` is a union of `Subscription | Favorite | PlaybackSession | FileTrack | PodcastDownload`
    - `useLocalSearch()` constructs rows by copying those storage entities through unchanged
    - `executeLocalSearchAction()` then repeatedly casts `result.data as ...` and branches on storage-specific fields like `session.localTrackId`, `session.audioUrl`, and `download.id`
  - problems:
    - the search layer is exposing DB row topology instead of a normalized “what this result means” contract
    - action behavior depends on reconstructing semantics from heterogeneous storage shapes rather than consuming one explicit domain result type
    - this makes it harder to finish the identity cleanup because transport/storage details keep leaking upward into search UX code
  - risk: search behavior remains brittle and storage-coupled, so future canonical-identity or persistence refactors will keep requiring wide, repetitive changes across both result production and result handling

### 59. `LibraryRepository` write APIs still expose near-full persistence rows instead of narrow command-shaped inputs

Priority: cleanup

- the library repository’s public write surface still accepts objects that are almost complete stored entities, including persistence-managed and derived fields, instead of a tighter domain command contract.
  - affected: `apps/cloud-ui/src/lib/repositories/LibraryRepository.ts`
  - current behavior:
    - `addSubscription(sub: Omit<Subscription, 'id'>)` accepts a near-full stored subscription row
    - `addFavorite(favorite: Omit<Favorite, 'id'>)` accepts a near-full stored favorite row, including derived `key` and persistence field `addedAt`
    - callers such as `exploreStore` must construct storage-shaped payloads before they cross the repository boundary
  - problems:
    - the repository API is leaking persistence shape instead of owning record construction
    - derived storage artifacts like favorite `key` are still part of the public write contract
    - write callers need to know too much about how rows are stored, rather than just supplying canonical business inputs
  - risk: storage details remain coupled to app-layer command flows, making future cleanup of canonical identity, timestamps, or derived fields unnecessarily invasive

### 60. Favorite creation still relies on a bespoke split input contract that forces mappers to synthesize placeholder values

Priority: cleanup

- favorite creation is still mediated through separate `FavoritePodcastInput` and `FavoriteEpisodeInput` bags rather than one explicit favorite-create command aligned with canonical episode semantics.
  - affected:
    - `apps/cloud-ui/src/lib/db/types.ts`
    - `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
    - `apps/cloud-ui/src/store/exploreStore.ts`
  - current behavior:
    - `FavoriteEpisodeInput` requires fields like `description`, `duration`, and `pubDate`
    - `mapSearchEpisodeToFavoriteInputs()` fills missing fields with placeholders such as `''` and `0`
    - `mapPlaybackSessionToFavoriteInputs()` also manufactures `''` when the session snapshot lacks description or publish time
    - `exploreStore.addFavorite()` later treats parts of that episode bag as effectively optional anyway
  - problems:
    - the command contract is not modeling the true domain boundary; it is modeling the current storage assembly process
    - upstream mappers are incentivized to fabricate placeholder values just to satisfy the type
    - this weakens the signal of what favorite creation actually requires versus what is merely nice-to-have metadata
  - risk: favorite persistence remains dependent on lossy synthetic defaults, so data-quality drift can be masked as valid input and future cleanup has to untangle yet another bespoke adapter layer


### 76. Favorite persistence is still modeled as a partially optional snapshot even though the canonical add-favorite path now owns most of those fields

Priority: should fix

- the favorite contract still looks like a backward-compatible loose snapshot, while the current canonical creation path already assembles a much stricter episode record from discovery data.
  - affected:
    - `apps/cloud-ui/src/lib/db/types.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/store/exploreStore.ts`
    - `apps/cloud-ui/src/lib/vault.ts`
    - `apps/cloud-ui/src/store/__tests__/exploreStore.test.ts`
  - current behavior:
    - `Favorite` still marks `description`, `pubDate`, `durationSeconds`, and `episodeArtworkUrl` as optional
    - `normalizeFavoriteRecord()` enforces canonical identity plus a few headline fields, but does not validate those episode snapshot fields
    - `exploreStore.addFavorite()` constructs favorites from canonical episode/podcast inputs where `description`, `pubDate`, `duration`, and `artworkUrl` are already available on the page-rendering contract
    - tests still exercise undefined `episodeArtworkUrl` cases, reinforcing the looser shape
  - problems:
    - the stored favorite contract no longer reflects the stricter first-release source-of-truth assumptions
    - domain types, storage normalization, and tests are still optimized for missing snapshot fields even though the canonical favorite creation flow is richer than that
    - this keeps optionality alive downstream in row models, playback payload builders, and vault schemas where stricter invariants would simplify reasoning
  - risk: favorite-related UI and persistence logic will keep carrying stale defensive branches and fallback behavior, increasing the cost of fully aligning the app around canonical episode snapshots

### 77. Episode-row download actions still source persisted episode description from presentation text instead of a canonical command payload

Priority: should fix

- the list-row download path is currently feeding a presentation-transformed description string into the download persistence contract, even though the row model already advertises a dedicated command field for this data.
  - affected:
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
    - `apps/cloud-ui/src/components/EpisodeRow/EpisodeListItem.tsx`
    - `apps/cloud-ui/src/components/EpisodeRow/DownloadEpisodeButton.tsx`
    - `apps/cloud-ui/src/lib/downloadService.ts`
  - current behavior:
    - `EpisodeRowModel.downloadArgs` includes `episodeDescription?: string`
    - the row-model builders for canonical episode/search/favorite/history rows generally do not populate that field
    - `EpisodeListItem` passes `episodeDescription={model.description}` to `DownloadEpisodeButton` instead of `model.downloadArgs?.episodeDescription`
    - `model.description` is a display field built with `stripHtml(...)`, so the persisted download snapshot can inherit presentation-shaped text rather than the canonical source description
  - problems:
    - the download command boundary is not actually owned by the command payload; it is reaching back into UI display state
    - a field intended for rendering is being reused as storage input after transformation/sanitization choices have already been applied
    - the row model now carries two competing description channels, but the canonical one is mostly ignored
  - risk: downloaded episode snapshots can diverge from the canonical episode contract depending on which UI surface initiated the download, making future metadata tightening and replay consistency harder

### 79. Canonical remote download initiation is still split across multiple overlapping command builders

Priority: should fix

- the codebase still does not have one authoritative “download this canonical remote episode” command boundary; instead several builder shapes coexist and feed the same persistence path from different semantic layers.
  - affected:
    - `apps/cloud-ui/src/lib/downloadService.ts`
    - `apps/cloud-ui/src/components/Player/PlayerDownloadAction.tsx`
    - `apps/cloud-ui/src/components/EpisodeRow/DownloadEpisodeButton.tsx`
    - `apps/cloud-ui/src/routeComponents/podcast/EpisodeDetailDownloadButton.tsx`
    - `apps/cloud-ui/src/lib/player/remotePlayback.ts`
    - `apps/cloud-ui/src/lib/player/playbackExport.ts`
    - `apps/cloud-ui/src/lib/remoteTranscript.ts`
  - current behavior:
    - `downloadService.ts` exports three overlapping builders:
      - `buildDownloadJobOptions(...)`
      - `buildDownloadJobOptionsFromRemoteMetadata(...)`
      - `buildCanonicalRemoteEpisodeDownloadOptions(...)`
    - player-side actions and remote playback use the generic `buildDownloadJobOptions(...)` path off metadata objects
    - detail/list buttons use the flattened `buildCanonicalRemoteEpisodeDownloadOptions(...)` path
    - playback export and transcript auto-save use `buildDownloadJobOptionsFromRemoteMetadata(...)`
    - all of them ultimately target the same `DownloadJobOptions` persistence flow
  - problems:
    - one business command is being expressed through multiple partially overlapping input contracts
    - the boundary between “canonical remote episode”, “player metadata snapshot”, and “download execution options” is still not owned by one layer
    - validation and data-quality decisions can drift across entry points because callers are not forced through one authoritative adapter
  - risk: future tightening of download metadata invariants will require synchronized edits across several builders and UI paths, increasing the chance that one surface preserves stale fallback behavior

### 82. `HistoryPage` locally overrides the playback-session row model and bypasses its shared description normalization contract

Priority: cleanup

- the history page is no longer treating `fromPlaybackSession()` as the authoritative row-model mapper for history sessions; it mutates the model afterward for local rows.
  - affected:
    - `apps/cloud-ui/src/routeComponents/HistoryPage.tsx`
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
    - `apps/cloud-ui/src/lib/htmlUtils.ts`
  - current behavior:
    - `fromPlaybackSession()` always normalizes session descriptions through `stripHtml(session.description || '')`
    - `HistoryPage` then builds `finalModel` and, for `session.source === 'local'`, overwrites `description` with raw `session.description`
    - other consumers of `EpisodeRowModel` continue to trust the shared mapper’s output as the normalized display contract
  - problems:
    - one screen is bypassing the shared row-model normalization rule instead of fixing the mapper or introducing an explicit variant
    - the row-model layer no longer guarantees consistent display-shape semantics for `description`
    - later UI cleanup has to remember that one caller is silently patching the supposedly shared model after the fact
  - risk: display behavior for history rows can drift from other episode-row surfaces, and future text/HTML normalization changes may miss this caller-specific override entirely


### 85. Favoriting a search episode still depends on a second podcast-detail lookup instead of the search result’s own snapshot

Priority: should fix

- the search-result favorite flow is still not self-contained; clicking favorite on a `SearchEpisode` triggers a second canonical podcast-detail lookup before the app will persist the favorite.
  - affected:
    - `apps/cloud-ui/src/components/GlobalSearch/SearchEpisodeItem.tsx`
    - `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
    - `apps/cloud-ui/src/lib/discovery/queryCache.ts`
  - current behavior:
    - `SearchEpisodeItem` calls `ensurePodcastDetail(queryClient, episode.podcastItunesId, globalCountry)` inside `buildAddPayload()`
    - only after that fetch resolves does it call `mapSearchEpisodeToFavoriteInputs(podcast, episode)`
    - the `SearchEpisode` DTO already carries `podcastItunesId`, `showTitle`, `artwork`, `guid`, `audioUrl`, `shortDescription`, `trackTimeMillis`, and `releaseDate`
  - problems:
    - a user action on an already loaded search result still depends on a second query/cache path and the current global country context
    - the favorite command boundary is not owned by the search-result snapshot itself, even though that snapshot already contains most of the persisted metadata
    - add-favorite correctness/availability can now drift with detail-query behavior instead of being a pure transformation of the selected result
  - risk: search-result favoriting can fail, block, or persist a country/detail-derived snapshot that differs from the actual search entity the user clicked


### 94. Subscribe and add-favorite idempotency still depend on store-local read-before-write orchestration instead of repository-owned commands

Priority: should fix

- the app’s two main library write commands still rely on `exploreStore` doing a local “check existing, then insert” sequence, while repository and DB layers only expose thin add/get methods plus unique indexes underneath.
  - affected:
    - `apps/cloud-ui/src/store/exploreStore.ts`
    - `apps/cloud-ui/src/lib/repositories/LibraryRepository.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/store/__tests__/exploreStore.test.ts`
    - `apps/cloud-ui/src/lib/repositories/__tests__/LibraryRepository.test.ts`
  - current behavior:
    - `subscribe()` calls `getSubscriptionByPodcastItunesId(...)` and only then `addSubscription(...)`
    - `addFavorite()` calls `getFavoriteByKey(...)` and only then `addFavorite(...)`
    - repository APIs remain thin row-oriented methods rather than a single `createIfMissing` / idempotent command
    - store tests only cover coalescing inside one store instance, while repository tests codify pass-through behavior
    - DB uniqueness is still physically enforced by `&podcastItunesId` and `&key`, so external or cross-context duplicate wins would surface as storage errors
  - problems:
    - the real command semantics live in the store, not in the repository layer that owns persistence
    - idempotency is only guaranteed for one in-memory caller lane, not for the storage command boundary itself
    - a duplicate write that loses the race outside that one coalesced path is handled as a generic failure/toast instead of an idempotent success
  - risk: subscribe/favorite behavior remains dependent on where the write originated and how many callers raced, rather than on one repository-owned command contract with deterministic duplicate semantics

### 95. Favorite and subscription field normalization still has two competing owners: `exploreStore` and `dexieDb`

Priority: cleanup

- the write path for subscriptions and favorites still normalizes/validates the same canonical fields twice in different layers, with one rule set in the store and another in the DB layer.
  - affected:
    - `apps/cloud-ui/src/store/exploreStore.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/lib/repositories/LibraryRepository.ts`
  - current behavior:
    - `exploreStore` defines `normalizeRequiredSubscriptionField()`, `normalizeRequiredFavoriteField()`, `normalizeOptionalFavoriteField()`, and `resolveCountryAtSave()`
    - `subscribe()` and `addFavorite()` trim/check required fields, construct derived values like `key`, and fail early with warnings before calling the repository
    - `DB.addSubscription()` still runs `buildSubscriptionRecord()` / `normalizeSubscriptionRecord()`
    - `DB.addFavorite()` still runs `normalizeFavoriteRecord()`, which recomputes the key and revalidates canonical fields again
  - problems:
    - canonical write normalization no longer has one owner; caller-facing behavior and persistence behavior can drift independently
    - the store currently decides which malformed inputs are silently rejected with warnings, while the DB layer decides which malformed inputs throw storage errors
    - repository methods sit between the two layers without owning or simplifying the normalization contract
  - risk: tightening or changing favorite/subscription invariants will require synchronized edits across store and DB layers, increasing the chance of inconsistent validation semantics and hard-to-debug write behavior


### 96. `Favorite.pubDate` is no longer a stable “published-at” field; some favorite builders synthesize it from download time or empty-string fallbacks

Priority: should fix

- the `Favorite` snapshot contract still presents `pubDate` as episode publication metadata, but some add-favorite adapters now fabricate that field from unrelated timestamps or sentinel empty strings.
  - affected:
    - `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
    - `apps/cloud-ui/src/lib/player/episodeMetadata.ts`
  - current behavior:
    - canonical discovery favorites preserve `episode.pubDate`
    - search-result favorites fall back to `episode.releaseDate ?? ''`
    - download-backed favorites write `pubDate: new Date(track.downloadedAt).toISOString()`
    - playback-session favorites write `pubDate: session.publishedAt ? ... : ''`
    - later consumers treat `favorite.pubDate` as real publication metadata for UI and playback metadata assembly
  - problems:
    - one persisted field now mixes three different meanings: real publication time, download completion time, and “missing but coerced to empty string”
    - downstream code cannot distinguish whether a favorite subtitle/date is canonical episode metadata or a locally fabricated placeholder
    - the contract encourages silent semantic drift instead of explicit modeling of “publication date unknown”
  - risk: favorites created from downloads/history/search can display or replay with misleading publication metadata, and later cleanup will have to unwind persisted rows whose `pubDate` no longer means one thing consistently


### 107. Local-search action tests still treat malformed favorite/history rows as valid fallback-playback inputs

Priority: cleanup

- the local-search regression suite is still protecting behavior where canonical-identity gaps in favorite/history results are accepted and downgraded into direct playback instead of being rejected at the boundary.
  - affected:
    - `apps/cloud-ui/src/lib/__tests__/localSearchActions.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/localSearchActions.playback.test.ts`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
  - current behavior:
    - one test constructs a favorite with `key: '::'`, empty `podcastItunesId`, and empty `episodeGuid`, then expects `executeLocalSearchAction()` to skip canonical navigation and play it directly
    - another test constructs an `explore` history session with empty `podcastItunesId` and `episodeGuid`, then expects remote-playback delegation to proceed as the fallback path
    - the playback-focused companion tests reinforce those same malformed favorite/history shapes as supported helper inputs
  - problems:
    - the suite is still framing canonical-identity failure as a normal recoverable action contract rather than as upstream data corruption or a search-result modeling bug
    - malformed local-search rows remain regression-protected even though the PI-first refactor is trying to make favorites/history canonical-episode-owned
    - this makes it harder to tighten local-search result typing and action handling because tests keep preserving “broken identity, but still play it” semantics
  - risk: local-search actions will continue to accept and operationalize degraded favorite/history records, prolonging mixed canonical/snapshot behavior in library flows


### 110. History and favorites page tests still render against partial store rows that do not match the active persistence contracts

Priority: cleanup

- several page-level UI tests are still fabricating incomplete `PlaybackSession` / `Favorite` rows instead of using schema-valid persisted shapes.
  - affected:
    - `apps/cloud-ui/src/routeComponents/__tests__/LibrarySWR.test.tsx`
    - `apps/cloud-ui/src/routeComponents/__tests__/HistoryPage.row-render.test.tsx`
    - `apps/cloud-ui/src/routeComponents/__tests__/HistoryPage.playback.test.tsx`
  - current behavior:
    - `LibrarySWR.test.tsx` feeds `HistoryPage` with `sessions: [{ id, title, lastPlayedAt, progress, durationSeconds, source: 'explore' }]`, omitting the canonical explore-session fields that runtime rows require
    - the same file feeds `FavoritesPage` with `favorites: [{ key: 'fav-1', title: 'Prior Favorite', audioUrl: 'url' }]`, even though the active favorite contract is `episodeTitle / podcastTitle / podcastItunesId / episodeGuid / countryAtSave`
    - `HistoryPage.row-render.test.tsx` and `HistoryPage.playback.test.tsx` also preserve hybrid explore sessions carrying `localTrackId`, reinforcing half-local/half-remote row shapes in UI tests
  - problems:
    - page-level tests are no longer exercising the real persistence contract; they are exercising ad hoc convenience shapes
    - malformed or hybrid history/favorite rows remain normalized inside the page layer instead of being rejected or repaired at a lower boundary
    - this reduces the signal of the UI suite because “page renders” no longer means “page renders the rows the app actually persists”
  - risk: history/favorites UI code will keep accreting defensive logic for impossible or hybrid row shapes simply because those shapes are still protected by page-level regression tests
