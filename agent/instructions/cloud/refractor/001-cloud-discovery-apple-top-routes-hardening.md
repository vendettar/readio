# Instruction 001: Cloud Discovery Apple Top Routes Hardening

Harden the Apple top-chart routes so they stop caching suspicious-empty payloads, stop carrying over-wide shared contracts, and expose only the fields the Explore surface actually owns.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: High
- **Owner Stream**: Cloud API Apple chart boundary + Cloud UI Explore top sections
- **Depends on**: Current Apple-first-hop architecture for Top Shows and Top Episodes

## 2. Constraint Check

- Current intended architecture in this thread
  - Explore has exactly 3 sections:
    - Editor's Picks via PI `podcasts-batch-byguid`
    - Top Shows via Apple first-hop
    - Top Episodes via Apple first-hop
- `apps/docs/content/docs/general/api/apple/apple-api.mdx`
  - Top Shows source is Apple RSS `.../top/{limit}/podcasts.json`
  - Top Episodes source is Apple RSS `.../top/{limit}/podcast-episodes.json`
  - Apple top-episode payload is much narrower than Apple search/lookup payload
- `agent/instructions/cloud/022-discovery-cache-graceful-degradation.md`
  - stale fallback is allowed only for recoverable upstream failures
  - local mapping/contract bugs must not silently overwrite cache
- Current in-repo canonical identity contract
  - show route identity = `podcastItunesId`
  - episode route identity = canonical `episodeGuid` encoded as compact key
  - Apple raw field names (`id`, `url`, `collectionViewUrl`) are upstream transport fields, not automatically the cloud UI contract

## 3. Problem Statement

The current Apple top-chart implementation has three correctness problems:

1. `handleTopPodcasts` and `handleTopEpisodes` treat structurally bad but syntactically valid upstream payloads as success, so `[]` can overwrite known-good cache for 24 hours.
2. `mapTopEpisode` and `mapTopPodcast` serialize a shared `discoveryPodcastResponse` shape that is wider than the Explore consumer contract.
3. Top Episodes currently discard Apple-provided genres even though the Apple top-episode payload includes them and the UI already tries to render them.
4. Top-route tests can still drift toward Apple search/lookup payload shape if the instruction does not explicitly forbid it.

This instruction exists to harden those routes without changing product ownership:

- Apple remains the first-hop owner for Top Shows and Top Episodes.
- The response contracts become route-specific and narrow.
- Empty/suspicious upstream payloads stop being treated as successful refreshes by default.

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Apple chart refresh must validate payload quality before cache write | Valid JSON with missing/empty `feed.results` is not a trustworthy chart refresh |
| D2 | Top Shows and Top Episodes must not reuse the full shared discovery DTO | These routes do not own the full discovery/detail/search field set |
| D3 | Top Episodes must preserve Apple chart genres when present | The docs show genres and the UI already has a consumer slot for them |
| D4 | `url` must not remain a hard-required field for Top Shows if the active route only needs `podcastItunesId` | Avoid unnecessary row drops from incidental Apple field absence |
| D5 | Cache policy comments must match implementation exactly | Discovery cache debugging cannot rely on stale comments |
| D6 | Top-route fixtures must use Apple top-chart payload semantics, not Apple search/lookup payload semantics | Prevent test residue from re-widening route contracts |

## 5. Affected Methods

### Cloud API

- `apps/cloud-api/discovery_apple.go`
  - `handleTopPodcasts`
  - `handleTopEpisodes`
  - `mapTopPodcast`
  - `mapTopEpisode`
  - `mapAppleDiscoveryPodcastToDiscoveryPodcast`
- `apps/cloud-api/discovery.go`
  - shared chart TTL comments and shared DTO ownership
  - `getWithGracefulDegradation`
- `apps/cloud-api/discovery_test.go`
  - top-chart normalization and cache behavior coverage

### Cloud UI

- `apps/cloud-ui/src/lib/discovery/schema.ts`
- `apps/cloud-ui/src/lib/discovery/cloudApi.ts`
- `apps/cloud-ui/src/hooks/useDiscoveryPodcasts.ts`
- `apps/cloud-ui/src/components/Explore/PodcastShowCard.tsx`
- `apps/cloud-ui/src/components/Explore/EditorPickShowCard.tsx`
- `apps/cloud-ui/src/components/Explore/EditorPickShowsCarousel.tsx`
- `apps/cloud-ui/src/components/Explore/PodcastEpisodesGrid.tsx`

## 6. Required Changes

### Scope Boundary

This instruction owns Apple top-chart route hardening only:

- `top-podcasts`
- `top-episodes`
- their direct Explore-facing DTO/schema consumers

It does not own:

- Apple search DTO cleanup beyond top-route accidental reuse
- PI relay validation internals
- RSS fallback/page-alignment logic
- broad shared-infra consolidation beyond the minimal local changes needed to stop top routes from depending on it

If a generic cleanup is still useful after the top-route contract is narrowed, move that final cleanup into Instruction 006 instead of turning this into a cross-stack abstraction change.

### A. Validate Apple chart payloads before caching

For both `handleTopPodcasts` and `handleTopEpisodes`:

1. Treat these as invalid refresh results by default:
   - missing `feed`
   - missing `results`
   - `results` empty when no explicit product decision says empty charts are valid
   - all rows dropped during mapping because required identity fields were missing
2. Return a classified upstream-invalid error for those cases.
3. Allow stale fallback on expired cache when the refresh failed because the upstream payload was invalid.
4. Do not cache `[]` unless the route explicitly and intentionally defines empty chart as a valid business result.

Required test additions:

- valid JSON but empty `feed.results` does not overwrite warm cache
- valid JSON but all rows fail mapping does not overwrite warm cache
- no-cache + invalid chart payload returns a hard error

### B. Split top-route DTOs away from the shared discovery DTO

Stop using one shared DTO for:

- top shows
- top episodes
- search podcast results
- search episode results
- PI detail payloads

For this instruction, at minimum introduce separate server-owned and UI-owned contract types for:

- Top Shows
- Top Episodes

Those DTOs must not inherit search/detail-only metadata just because Apple happens to provide it elsewhere.
In particular, do not make `collectionViewUrl`, search-only aliases, or raw Apple lookup naming part of the top-route contract unless the active Explore UI has a real production reader.

Those route DTOs should only expose fields the Explore surface actually uses.

Completion criteria for this split are not limited to server DTOs and UI schemas.
The narrowing is not complete until:

- active Explore consumers stop typing top shows / top episodes as the old shared discovery contract
- changed-zone tests stop constructing removed fields just to preserve old fixture shape
- top-show consumers stop depending on editor-pick-only fields such as `podcastGuid` or `editorPickSnapshot`

If a UI component still needs to serve both Editor's Picks and Top Shows, model that explicitly with separate contracts or separate components.
Do not silently keep the old widened assumptions alive inside a supposedly narrowed top-route card.
The preferred end state is:

- a top-show-only card/consumer path that accepts only the narrowed Top Shows contract
- a separate editor-pick card/consumer path that owns GUID/snapshot route-state behavior

### C. Remove unnecessary hard dependency on Apple `url` for Top Shows

`mapTopPodcast` currently drops rows when `item.URL` is empty.

That is too strict unless you can prove the Top Shows UI still production-owns `url`.

Given the active route generation in `PodcastShowCard`, the row identity contract is:

- `podcastItunesId`
- title
- artwork/image
- optional author

If `url` is retained:

- make it optional in the top-shows contract
- do not drop the row solely because `url` is missing

### D. Preserve top-episode genres

`mapTopEpisode` must map `item.Genres` through the same normalization logic used for Apple chart genres instead of forcing `Genres: []`.

Required test addition:

- top-episode normalization preserves Apple genre name(s)
- changed-zone top-route tests must use Apple top-chart payload examples, not Apple Search result fixtures

### E. Align docs/comments with actual TTL

`apps/cloud-api/discovery.go` currently documents top-chart TTL as 30 minutes while the code uses 24 hours.

This instruction must update the comment and any nearby documentation strings to the actual value.

### F. Must Not Regress

- Top-chart refresh validation must happen before cache write, not after a narrowed DTO is already serialized.
- A successful chart refresh should imply at least one routable row unless product explicitly redefines empty charts as valid business output.
- Top Shows must continue exposing canonical navigation identity through `podcastItunesId`; do not widen the DTO again just to preserve optional upstream transport fields.
- Top Episodes must not compensate for missing canonical route identity by importing search-only or detail-only fields into the top-route contract.
- Top Shows must not continue carrying editor-pick-only route-state assumptions through a narrowed top-show DTO.
- Top Episodes should resolve clickthrough to the podcast show route, not attempt cross-provider single-episode matching, unless a stable episode-level join key is explicitly introduced and documented.
- Top-route fixtures must stay modeled on Apple RSS chart payloads only; do not borrow Apple Search or Apple Lookup result shapes for convenience.

### G. Changed-Zone Tests To Rewrite Or Remove

- `apps/cloud-api/discovery_test.go`
  - add explicit invalid-refresh coverage for empty `feed.results`
  - add explicit invalid-refresh coverage for “all rows dropped during mapping”
  - add a top-episode normalization case that proves Apple chart genres survive mapping
- `apps/cloud-ui/src/lib/discovery/__tests__/cloudCutover.sameOrigin.test.ts`
  - if a top-route contract is covered here, remove search/lookup-only residue such as `collectionViewUrl`
- any Explore top-section tests that still assume:
  - Apple chart rows require `url`
  - Apple top episodes normalize to `genres: []`
  - Apple search/lookup aliases are valid top-route fixture fields

### H. Recommended Rollout Order

1. Add failing cloud-api tests for invalid refresh and preserved top-episode genres.
2. Add or tighten Explore-facing contract tests for narrowed top-route payloads.
3. Split top-route DTOs and mapping logic away from shared discovery/detail/search contracts.
4. Tighten UI schema/hooks/components to the narrowed top-route shapes.
5. Remove stale comments, over-wide fixtures, and any shared-field residue that only survived because old tests allowed it.

## 7. Forbidden Outcomes

- No change of source authority away from Apple for Top Shows / Top Episodes
- No fallback from top charts to PI or RSS
- No new compatibility DTO that reintroduces the whole shared discovery field set under a new name
- No continued reliance on `url` as a required chart-row field unless the active UI genuinely consumes it
- No narrowed top-show component may still read editor-pick-only fields without an explicit separate contract
- No top-episode UI may pretend to support precise episode-detail clickthrough by guessing across Apple and PI payloads
- No test fixture may keep Apple search-only or lookup-only fields alive as top-route requirements

## 8. Verification Plan

### Required Automated Verification

- `go test ./...` in `apps/cloud-api`
- focused tests for:
  - top podcasts payload normalization
  - top episodes payload normalization
  - chart cache invalid-refresh protection
- `pnpm -C apps/cloud-ui typecheck`
- changed-zone vitest suites covering Explore top sections

### Required Manual Verification

1. Open Explore and confirm Top Shows still navigates by canonical show route.
2. Open Explore and confirm Top Episodes now navigate directly to the canonical show route.
3. Confirm Top Episodes can display genre text when Apple provides it.
4. Confirm an Apple chart outage does not replace previously cached rows with an empty carousel.

## 9. Acceptance Criteria

- [ ] `handleTopPodcasts` does not cache suspicious-empty/invalid chart refreshes as success
- [ ] `handleTopEpisodes` does not cache suspicious-empty/invalid chart refreshes as success
- [ ] stale chart cache survives upstream-invalid refresh attempts
- [ ] Top Shows no longer requires Apple `url` to keep a row alive unless the UI truly owns it
- [ ] Top Episodes preserve Apple genres when present
- [ ] Top Shows and Top Episodes use route-specific narrow DTOs
- [ ] TTL comments match the implemented TTL
- [ ] changed-zone tests no longer protect Apple search/lookup field residue on top routes
- [ ] changed-zone top-route fixtures no longer require `collectionViewUrl` or other Apple search/lookup aliases to stay green

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
