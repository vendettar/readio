# Instruction 004: Cloud Discovery Editor Pick And Route Identity Tightening

Refactor editor-pick snapshot consumption and content-route identity handling so routes never fall back to unsupported GUID IDs, and editor-pick detail pages still perform authoritative PI byitunesid enrichment.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: High
- **Owner Stream**: Cloud UI Explore/editor-pick routing + PI detail lookup ownership
- **Depends on**: Current editor-pick source remains PI `podcasts-batch-byguid`

## 2. Constraint Check

- Current intended architecture in this thread
  - Editor's Picks are sourced by PI `podcasts-batch-byguid`
  - podcast/episode detail and enrichment use PI via `itunesId`
- `apps/docs/content/docs/general/api/podcastindex/podcasts.mdx`
  - GUID batch is a show-summary lookup, not the authoritative detail endpoint
- route topology in `apps/cloud-ui/src/lib/routes/podcastRoutes.ts`
  - `/podcast/$country/$id[...]` requires a concrete route ID; the active detail stack treats that as the canonical show identifier
- Current in-repo canonical identity contract
  - editor-pick source lookup identity = PI `podcasts/batch/byguid`
  - content-route show identity = `podcastItunesId`
  - Podcast GUID is a source lookup identity, not a content-route identity

## 3. Problem Statement

Editor-pick handling currently mixes two identities:

- Podcast GUID
- podcast iTunes ID

That causes three problems:

1. `PodcastShowPage` skips authoritative PI byitunesid lookup entirely when a snapshot is present.
2. Several route builders fall back to Podcast GUID when the active content-route contract still expects iTunes ID.
3. The wrapper mapping from PI batch summary to `DiscoveryPodcast` can synthesize an empty `id`, which then leaks into keys and route helpers.
4. Tests can still preserve GUID-backed route assumptions or stale snapshot fields unless the instruction forbids them explicitly.

This instruction restores a clean contract:

- snapshots are optimistic bootstrap data only
- authoritative detail still comes from PI byitunesid
- content routes do not fall back to GUID IDs

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Editor-pick snapshots are bootstrap hints, not authoritative detail payloads | PI batch summary is not the same as byitunesid detail |
| D2 | Content routes must not fall back to GUID IDs when the route stack resolves by iTunes ID | GUID fallback generates unsupported detail URLs |
| D3 | `DiscoveryPodcast.id` must not be synthesized from optional fields without validation | Empty string IDs create unstable list keys and route state |
| D4 | Tests that currently protect snapshot-only short-circuit behavior must be replaced | They lock in unsupported behavior after the architecture cutover |
| D5 | Editor-pick snapshot fields are bootstrap-only and must not become a shadow canonical store contract | Batch summary payloads are not authoritative detail records |

## 5. Affected Methods

- `apps/cloud-ui/src/lib/discovery/index.ts`
  - `mapPodcastIndexFeedSummaryToDiscoveryPodcast`
- `apps/cloud-ui/src/lib/discovery/editorPicks.ts`
  - `mapEditorPickToPodcast`
  - `getEditorPickGuidFromPodcast`
  - `getCanonicalEditorPickPodcastID`
- `apps/cloud-ui/src/components/Explore/PodcastShowCard.tsx`
- `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
  - `fromEpisode`
- `apps/cloud-ui/src/routeComponents/podcast/PodcastShowPage.tsx`
- `apps/cloud-ui/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
- affected editor-pick tests in:
  - `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastShowPage.editorPick.test.tsx`
  - `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.editorPick.test.tsx`
  - `apps/cloud-ui/src/components/Explore/__tests__/PodcastShowCard.editorPickRoute.test.tsx`

## 6. Required Changes

### Scope Boundary

This instruction owns editor-pick bootstrap and content-route identity behavior only:

- PI batch-summary to editor-pick model mapping
- editor-pick card/link generation
- show/episode/detail route identity derived from editor-pick state
- authoritative PI byitunesid enrichment behavior after navigation

It does not own:

- generic PI relay validation
- Apple search click-through
- RSS fallback/page sequencing beyond the editor-pick identity boundary
- broad shared-schema consolidation not directly required to stop GUID leakage into content routes

### A. Always perform PI byitunesid enrichment on detail pages

`PodcastShowPage` must stop disabling the PI byitunesid query simply because an editor-pick snapshot exists.

Required behavior:

1. snapshot may seed `initialData`
2. PI byitunesid query still runs when a canonical iTunes ID exists
3. page rendering may optimistically use snapshot data while the authoritative lookup resolves

This change is mandatory because the architecture explicitly says detail/enrichment is PI via iTunes ID.

### B. Stop GUID fallback in content-route ID builders

Review and tighten:

- `getCanonicalEditorPickPodcastID`
- `fromEpisode`
- `PodcastEpisodeDetailPage` show-route fallback logic

Required rule:

- if a content route requires podcast iTunes ID, do not substitute Podcast GUID
- if iTunes ID is unavailable, fail closed instead of building an unsupported content route
- use Podcast GUID only as the PI batch input identity, never as the outward-facing show route identity

### C. Tighten editor-pick batch mapping

`mapPodcastIndexFeedSummaryToDiscoveryPodcast` must stop manufacturing a `DiscoveryPodcast` with `id: ''`.

Required options:

1. use a route-specific editor-pick summary type that does not pretend empty ID is valid, or
2. require a valid canonical route identity before producing a routable editor-pick model

### D. Replace tests that protect snapshot-only or legacy-field behavior

The following behavior is no longer acceptable as a protected contract:

- `PodcastShowPage` snapshot path that skips PI byitunesid lookup entirely
- tests that send old Apple-era field names through permissive schemas and still pass
- tests that assume GUID-backed show routes are valid content routes
- tests that keep `feedId` or GUID-derived snapshot route identity alive without a production consumer

Those tests must be rewritten to protect:

- snapshot bootstraps render
- PI byitunesid still refreshes authoritatively
- detail routes remain iTunes-ID-backed

### E. Must Not Regress

- Snapshot bootstrap and authoritative PI byitunesid refresh must coexist; one must not suppress the other.
- Route state may carry `editorPickSnapshot` only as bootstrap context, not as a durable canonical store contract.
- If a card or detail route lacks canonical `podcastItunesId`, it must fail closed or render as unavailable instead of guessing with Podcast GUID.
- Episode backlinks and show links derived from editor-pick context must remain iTunes-ID-backed even when the original source lookup used GUID.
- PI batch summary fields must not silently graduate into “authoritative detail” simply because they were present in route state.

### F. Changed-Zone Tests To Rewrite Or Add

- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastShowPage.editorPick.test.tsx`
  - replace the current snapshot-only short-circuit protection
  - assert PI byitunesid still fires when snapshot exists
- `apps/cloud-ui/src/routeComponents/podcast/__tests__/PodcastEpisodesPage.editorPick.test.tsx`
  - remove raw Apple/legacy alias fixtures
  - assert editor-pick episode routes still derive valid iTunes-ID-backed show identity
- `apps/cloud-ui/src/components/Explore/__tests__/PodcastShowCard.editorPickRoute.test.tsx`
  - add missing fail-closed behavior for cards without canonical `podcastItunesId`
- `apps/cloud-ui/src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`
  - remove GUID-backed content-route expectations if still present

### G. Recommended Rollout Order

1. Add failing tests for “snapshot exists but PI byitunesid still runs” and “missing iTunes ID fails closed”.
2. Tighten editor-pick mapping helpers so only routable canonical identities escape.
3. Update page-level route building and detail/enrichment sequencing.
4. Remove stale snapshot-only / GUID-route / legacy-field fixtures.

## 7. Forbidden Outcomes

- No new route contract that redefines content-route `$id` as “GUID or iTunes ID”
- No continued snapshot-only detail behavior for editor-pick show pages
- No empty-string `DiscoveryPodcast.id` surviving into active editor-pick lists
- No test may preserve GUID-backed content-route identity as an accepted outcome

## 8. Verification Plan

### Required Automated Verification

- changed-zone vitest covering:
  - editor-pick show page bootstraps from snapshot but still calls PI byitunesid
  - editor-pick episode/detail routes do not fall back to GUID IDs
  - editor-pick list rows without valid iTunes ID fail closed rather than creating broken routes
- `pnpm -C apps/cloud-ui typecheck`
- `pnpm -C apps/cloud-ui lint`

### Required Manual Verification

1. Open an editor-pick show card and confirm the page renders immediately from snapshot but still performs PI detail enrichment.
2. Open an editor-pick episode route and confirm the back-link/show-link still resolves to a valid iTunes-ID-backed show route.
3. Confirm editor-pick cards without a routable iTunes ID do not navigate to dead pages.

## 9. Acceptance Criteria

- [ ] editor-pick detail pages still perform PI byitunesid enrichment when a canonical iTunes ID exists
- [ ] content routes no longer fall back to Podcast GUID IDs
- [ ] editor-pick summary mapping no longer emits empty-string routable IDs
- [ ] stale tests protecting snapshot-only or legacy-field behavior are replaced
- [ ] editor-pick tests no longer preserve `feedId` / GUID-backed show-route residue without a production owner
- [ ] cards or detail flows without canonical `podcastItunesId` fail closed instead of synthesizing GUID-backed content routes

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
