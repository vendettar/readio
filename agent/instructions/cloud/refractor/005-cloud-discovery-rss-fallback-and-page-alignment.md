# Instruction 005: Cloud Discovery RSS Fallback And Page Alignment

Align the RSS fallback route and the podcast detail pages with the intended discovery architecture: PI owns detail/enrichment, RSS remains fallback only, and the show/episodes/detail pages must not diverge into separate feed-first behaviors.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: High
- **Owner Stream**: Cloud UI podcast detail pages + Cloud API RSS fallback route
- **Depends on**: Current PI detail ownership and RSS fallback retention

## 2. Constraint Check

- Current intended architecture in this thread
  - podcast/episode detail and enrichment use PI via `itunesId`
  - RSS feed route is kept only as fallback
- `apps/docs/content/docs/general/api/rss-case-samples.mdx`
  - RSS is structurally inconsistent across real providers and should be treated as a fallback/normalization surface
- `apps/docs/content/docs/general/api/apple/apple-api.mdx`
  - Apple lookup is not a full archive source
- `apps/docs/content/docs/general/api/podcastindex/episodes.mdx`
  - PI episode list lookup is the intended archive/detail supplement
- Current in-repo fallback contract
  - PI byitunesid owns show/detail enrichment
  - PI episodes/byitunesid owns primary archive supplementation
  - PI episodes/byguid owns exact-episode fallback before RSS
  - RSS is allowed only for transcript/chapters/feed-only metadata and last-resort episode recovery

## 3. Problem Statement

The current page stack is inconsistent:

1. `PodcastShowPage` already has a PI supplementation/hydration path.
2. `PodcastEpisodesPage` is still feed-primary and only shows a passive “limited feed” notice instead of actually using PI enrichment.
3. `PodcastShowPage` and `useEpisodeResolution` do not share one explicit “PI-first detail, RSS fallback second” loading contract.
4. `fetchFeed` maps some upstream-resolution failures as `INVALID_URL`, which blurs invalid-input vs transient-upstream errors.
5. Without a stricter written contract, future refactors can accidentally re-promote RSS into a competing primary detail source.

This instruction aligns the stack so RSS stays a real fallback, not a competing primary route.

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | PI remains the primary detail/archive supplement; RSS is fallback only | Matches the intended architecture |
| D2 | Show page and episodes page must not use different archive strategies | Users should not see one page enriched and the sibling page truncated |
| D3 | Feed fetch must classify invalid input separately from transient upstream resolution/fetch failure | Error mapping and stale fallback depend on that distinction |
| D4 | Shared detail-loading logic should be centralized where possible | Avoid drift between show, episodes, and episode-detail flows |
| D5 | RSS fallback responsibilities must be enumerated explicitly, not implied | Prevent silent scope creep back into feed-first behavior |

## 5. Affected Methods

### Cloud API

- `apps/cloud-api/discovery_feed.go`
  - `handleFeed`
  - `fetchFeed`
  - `mapParsedFeed`
  - `mapParsedFeedEpisode`
  - feed error classification around target resolution/fetch

### Cloud UI

- `apps/cloud-ui/src/routeComponents/podcast/PodcastShowPage.tsx`
- `apps/cloud-ui/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
- `apps/cloud-ui/src/hooks/useEpisodeResolution.ts`
- `apps/cloud-ui/src/lib/discovery/podcastQueryContract.ts`

## 6. Required Changes

### Scope Boundary

This instruction owns:

- RSS fallback route behavior
- show/episodes/detail page loading order where RSS participates
- feed error classification and fallback mapping

It does not own:

- PI relay request/auth validation
- search click-through semantics
- editor-pick identity policy
- broad shared-client/schema consolidation except where those layers directly block page-alignment behavior

If a shared helper is introduced, it should encode the page-loading order and fallback responsibilities explicitly, not create another generic content-loading abstraction that hides ownership.

### A. Bring `PodcastEpisodesPage` up to the same enrichment contract as `PodcastShowPage`

The episodes page must stop being feed-primary with a passive warning only.

Required behavior:

1. PI byitunesid detail lookup remains the primary show lookup
2. PI episodes list becomes the archive supplement when RSS is clearly truncated
3. RSS remains available as:
   - transcript/chapters source
   - fallback episode source
   - source of feed-only metadata
4. Episodes page and show page must share the same truncation/hydration heuristics or a shared helper

### B. Make RSS fallback explicit in shared page logic

Review `PodcastShowPage` and `useEpisodeResolution` together and document one explicit order:

1. PI detail lookup
2. PI episode lookup / PI exact-episode lookup as needed
3. RSS feed fallback only when PI did not already resolve the required content

Allowed RSS fallback responsibilities must be explicit:

- transcript URL
- chapters URL
- feed-only summary metadata
- last-resort episode recovery when PI did not resolve the target

Avoid each page inventing its own order.

### C. Improve feed error classification

`fetchFeed` currently converts some target-resolution problems into `INVALID_URL`.

Refactor so that:

- malformed/non-http URL remains param error
- disallowed private/blocked target remains param error
- transient DNS/host resolution/fetch failures map as upstream failure, not invalid input

This is required for correct error reporting and potential stale fallback behavior higher in the stack.

### D. Review RSS mapping for fallback completeness

At minimum review whether channel-level description fallback is complete enough for real feeds captured in `rss-case-samples.mdx`.

If channel description is empty but other safe feed summary sources exist, use a deterministic fallback rather than serializing avoidable empties.

Do not expand RSS into a new primary-owner contract; this is about fallback completeness only.

### E. Must Not Regress

- The effective page-loading order must remain PI detail first, then PI episode archive/exact resolution, then RSS fallback only where PI did not already resolve the needed content.
- If PI archive resolution succeeds, RSS must not replace it as the authoritative episode list just because RSS also returned data.
- Show page, Episodes page, and Episode detail must share one truncation/fallback heuristic owner; drift between pages is a bug, not an acceptable local variation.
- RSS fallback may enrich feed-only metadata such as summary/transcript/chapters, but it must not become the source of canonical content-route identity.
- Feed classification must keep malformed/disallowed user input separate from transient DNS/TLS/timeout/upstream-fetch failures.

### F. Changed-Zone Tests To Rewrite Or Add

- `apps/cloud-api/discovery_test.go`
  - add coverage for transient feed-fetch failure mapping as upstream failure instead of invalid input
  - add mapping coverage for channel-summary fallback when primary description is empty
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastShowPage.hydration.test.tsx`
  - align with the explicit PI-first / RSS-fallback order
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastShowPage.cloudFeedCutover.test.tsx`
  - ensure RSS remains fallback, not primary
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.refresh.test.tsx`
  - protect PI-first exact resolution before RSS fallback
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.editorPick.test.tsx`
  - stop protecting RSS-only list behavior where PI supplementation is now required

### G. Recommended Rollout Order

1. Add failing cloud-api tests for feed error classification and summary fallback.
2. Add or tighten page tests around one shared PI-first / RSS-fallback order.
3. Refactor shared page heuristics/loading helpers before patching one-off pages.
4. Align show page, episodes page, and episode detail to the same order.
5. Remove stale RSS-primary fixtures and notices that no longer describe the real behavior.

## 7. Forbidden Outcomes

- No replacement of PI detail ownership with RSS
- No page-specific one-off hydration logic that diverges again immediately
- No treating transient feed-fetch failure as invalid user input
- No silent expansion of RSS into a co-equal primary detail/archive source

## 8. Verification Plan

### Required Automated Verification

- `go test ./...` in `apps/cloud-api`
- changed-zone vitest covering:
  - show page hydration path
  - episodes page hydration path
  - episode detail PI-first then RSS-fallback resolution
  - feed fetch invalid-input vs upstream-failure mapping
- `pnpm -C apps/cloud-ui typecheck`
- `pnpm -C apps/cloud-ui lint`

### Required Manual Verification

1. Open a podcast with a truncated RSS feed and confirm both show page and episodes page surface enriched episode lists consistently.
2. Open an older episode detail route and confirm PI resolution is tried before RSS fallback.
3. Trigger a temporary feed-fetch failure and confirm the error is classified as upstream failure, not bad input.

## 9. Acceptance Criteria

- [ ] `PodcastEpisodesPage` no longer relies on RSS-only episode lists when PI supplementation is required
- [ ] show page, episodes page, and episode detail share one explicit PI-first / RSS-fallback order
- [ ] show page and episodes page share the same truncation/hydration heuristic owner
- [ ] feed fetch distinguishes invalid URL input from transient upstream fetch failures
- [ ] RSS fallback remains intact for transcript/chapters/feed-only metadata
- [ ] allowed RSS fallback responsibilities are explicitly documented and enforced in changed-zone code/tests

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
