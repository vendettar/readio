# Instruction 002: Cloud Discovery Search Contract And Click-Through Hardening

Refactor Cloud discovery search so the backend and UI both honor the Apple-first-hop contract strictly, and episode/podcast click-through no longer depends on ambiguous `id` semantics or Apple `episodeGuid` being present.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: High
- **Owner Stream**: Cloud UI search overlay/result page + Cloud API Apple search contract
- **Depends on**: Instruction 031 search source decision, current Apple-first-hop + PI-second-hop architecture

## 2. Constraint Check

- Current intended architecture in this thread
  - Search overlay/result page uses Apple first-hop
  - Podcast/episode detail and enrichment use PI via `itunesId`
- `apps/docs/content/docs/general/api/apple/apple-api.mdx`
  - Podcast search rows are keyed by `collectionId`
  - Episode search rows carry `collectionId`, `trackId`, and sometimes `episodeGuid`
  - Search result payload does not guarantee transcript metadata
- `apps/docs/content/docs/general/api/podcastindex/episodes.mdx`
  - PI episode resolution is keyed by podcast iTunes ID and episode GUID or episode list lookup
- Current in-repo canonical identity contract
  - show route identity = `podcastItunesId`
  - episode route identity = canonical `episodeGuid` encoded as compact key
  - Apple `collectionId` must be normalized at the relay boundary into `podcastItunesId`
  - Apple `trackId` is not a canonical episode route key

## 3. Problem Statement

Search currently has three classes of contract drift:

1. Search podcast identity is still ambiguous in UI consumers because some code routes via `podcast.id` while the production join key is `podcastItunesId`.
2. Search episode click-through still assumes Apple `episodeGuid` exists, even though the Apple Search API does not guarantee it.
3. Search schemas are too permissive and continue accepting old/unsupported field shapes in tests and callers.
4. Search fixtures still tend to preserve Apple raw field names such as `collectionName`, `artistName`, `artworkUrl100`, and `collectionViewUrl`, which widens the active cloud contract by accident.

This instruction makes search explicit:

- podcast search identity uses `podcastItunesId`
- episode click-through uses PI second-hop enrichment when a canonical episode route cannot be built directly
- route-specific search DTOs become strict and minimal

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Search podcast route/navigation must use `podcastItunesId`, not generic `id` | Apple search contract and PI enrichment bridge are show-level iTunes IDs |
| D2 | Search episode click-through must not depend on Apple `episodeGuid` existing | Apple search episode payload is not guaranteed to provide it |
| D3 | Search DTOs must be route-specific and strict | Prevent legacy `collectionName`/`artworkUrl100`/other old fields from silently passing |
| D4 | UI search clients must expose explicit failure when payload parsing fails | Raw `SyntaxError` and permissive parsing hide contract regressions |
| D5 | Search result page and overlay must share the same canonical result semantics | One search surface must not route differently from the other |
| D6 | Raw Apple field names belong to upstream docs, not active cloud UI contracts | Relay normalization must terminate at the boundary |

## 5. Affected Methods

### Cloud API

- `apps/cloud-api/discovery_apple.go`
  - `handleSearchPodcasts`
  - `handleSearchEpisodes`
  - `isRelevantDiscoverySearchResult`

### Cloud UI

- `apps/cloud-ui/src/lib/discovery/schema.ts`
- `apps/cloud-ui/src/lib/discovery/cloudApi.ts`
- `apps/cloud-ui/src/lib/discovery/index.ts`
- `apps/cloud-ui/src/hooks/useDiscoverySearch.ts`
- `apps/cloud-ui/src/components/GlobalSearch/CommandPalette.tsx`
- `apps/cloud-ui/src/components/GlobalSearch/SearchEpisodeItem.tsx`
- `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
- `apps/cloud-ui/src/routeComponents/SearchPage.tsx`

### Tests To Review

- `apps/cloud-ui/src/components/GlobalSearch/__tests__/*`
- any test relying on permissive `PodcastSchema` / `SearchEpisodeSchema`

## 6. Required Changes

### Scope Boundary

This instruction owns:

- Apple search podcast hit contract
- Apple search episode hit contract
- search overlay/full-page click-through semantics
- UI-side discovery client/search schema behavior needed to make those contracts strict

It does not own:

- PI relay request validation internals beyond what search needs from the public cloud route
- editor-pick route identity cleanup
- RSS fallback/page loading order
- broad shared-schema/cache cleanup not directly required to harden search behavior

If a helper becomes useful across search and non-search paths, keep the search behavior correct first and defer generalized cleanup to Instruction 006.

### A. Make podcast search identity explicit

1. Search podcast contracts must guarantee `podcastItunesId`.
2. UI navigation must stop using `podcast.id` for podcast search result routes.
3. Overlay suggestions and full search page must both route through the same canonical field.

Minimum changed-zone fix:

- `CommandPalette.handleSelectPodcast` must route with `podcast.podcastItunesId`
- list keys may still use a stable local key, but route identity must not
- search fixtures must stop using `podcast.id` as semantic route identity

### B. Replace Apple-`episodeGuid`-only search episode navigation

The current search episode route-building path is incomplete:

- `CommandPalette.handleSelectEpisode`
- `fromSearchEpisode`

Both assume `episodeGuid` exists or can be derived from `id`.
That is not safe because Apple `trackId` is not the canonical compact-route episode key.

Required behavior:

1. If the Apple search result already carries a usable PI-compatible episode GUID, use it.
2. Otherwise:
   - bridge via `podcastItunesId`
   - resolve PI episodes for that show
   - match the target episode deterministically using available Apple fields such as:
     - title
     - audio URL / normalized audio stem
     - release date
3. Only after PI enrichment resolves the canonical episode identity may the UI build the detail route.
4. If resolution fails, degrade deterministically:
   - either navigate to the show route
   - or surface a controlled unavailable state
   - but do not silently no-op

### C. Tighten search DTOs and schemas

Stop using one permissive `PodcastSchema` for:

- Apple search podcast hits
- PI podcast detail
- editor-pick snapshots

At minimum define separate strict UI contracts for:

- Search podcast hit
- Search episode hit

Required schema cleanup:

- remove or stop accepting fields that this route does not own
- reject old Apple field aliases when they are not part of the active cloud contract
- make parsing failures visible and actionable

At minimum, changed-zone tests must stop relying on:

- `collectionName`
- `artistName`
- `artworkUrl100`
- `collectionViewUrl`

unless the relay explicitly normalizes those into active contract fields.

### D. Centralize JSON parse/error handling in the UI client

`fetchDiscoveryJSON` and `postDiscoveryJSON` duplicate logic and currently allow raw `JSON.parse` failures to leak without route-aware context.

Refactor so that:

1. JSON parse failure becomes a typed invalid-payload error
2. GET/POST discovery helpers share one response parsing/error mapping path
3. search callers receive a consistent error class for invalid cloud payloads

### E. Must Not Regress

- Search overlay and full Search page must share one canonical route-building contract; one surface must not use `podcastItunesId` while the other quietly falls back to generic `id`.
- Direct episode-detail navigation is allowed only when the canonical episode route key is already known; Apple `trackId` alone must never become a route surrogate.
- Search second-hop matching must be deterministic and based on normalized identity signals, not on upstream result order or ad hoc best-effort guesses.
- Search hit contracts must not imply transcript/chapter/detail ownership that Apple search does not actually provide.
- Repeated click-through for the same unresolved search episode should reuse one stable bridge identity/query path instead of fanning out duplicate PI lookups opportunistically.

### F. Changed-Zone Tests To Rewrite Or Add

- `apps/cloud-ui/src/components/GlobalSearch/__tests__/SearchEpisodeItem.urlHygiene.test.tsx`
  - keep the existing direct-`episodeGuid` case
  - add the missing no-`episodeGuid` case and assert deterministic second-hop or controlled degradation
- `apps/cloud-ui/src/lib/discovery/__tests__/cloudSearchCutover.sameOrigin.test.ts`
  - remove raw Apple aliases such as `collectionName`, `artistName`, `artworkUrl100`, `collectionViewUrl` unless they are explicitly normalized into the active search DTO
  - assert podcast navigation uses `podcastItunesId`
- any Search page / CommandPalette tests that still route via generic `id` or Apple `trackId` must be rewritten to protect canonical route semantics instead

### G. Recommended Rollout Order

1. Add failing search tests for podcast routing and missing-`episodeGuid` episode click-through.
2. Introduce one canonical search route/conversion helper used by both overlay and full-page search.
3. Tighten search DTOs and schemas around that contract.
4. Centralize discovery-client parsing/error mapping.
5. Remove legacy search fixture aliases and any fallback-to-`id` residue.

## 7. Forbidden Outcomes

- No fallback back to generic `id` for search podcast navigation
- No route building from Apple `trackId` alone
- No silent acceptance of old field shapes through permissive search schemas
- No search overlay/result-page divergence in route semantics
- No changed-zone test may keep raw Apple result field names alive as if they were current cloud DTO fields

## 8. Verification Plan

### Required Automated Verification

- `go test ./...` in `apps/cloud-api`
- changed-zone vitest covering:
  - overlay podcast click routes via `podcastItunesId`
  - search page podcast cards route via `podcastItunesId`
  - search episode click-through with Apple `episodeGuid`
  - search episode click-through when Apple `episodeGuid` is absent and PI matching is required
  - invalid cloud search payloads fail parsing clearly
- `pnpm -C apps/cloud-ui typecheck`
- `pnpm -C apps/cloud-ui lint`

### Required Manual Verification

1. Search a podcast and open it from overlay and full page; both should land on the same show route.
2. Search an episode whose Apple payload includes `episodeGuid`; confirm direct canonical episode navigation works.
3. Search an episode without `episodeGuid`; confirm PI second-hop enrichment still resolves or degrades predictably.
4. Confirm search playback still works when transcript metadata is absent.

## 9. Acceptance Criteria

- [ ] search podcast navigation uses `podcastItunesId`, not generic `id`
- [ ] search episode click-through no longer relies on Apple `trackId` or missing `episodeGuid`
- [ ] overlay and full search page share the same route semantics
- [ ] overlay and full search page share one canonical search route/resolution contract
- [ ] search DTOs are strict and route-specific
- [ ] UI discovery client wraps invalid JSON/payloads in explicit discovery errors
- [ ] changed-zone tests cover both direct and second-hop episode navigation
- [ ] changed-zone search fixtures no longer depend on raw Apple field aliases that the cloud contract does not own
- [ ] repeated unresolved episode click-through does not rely on ad hoc duplicate PI bridge requests

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
