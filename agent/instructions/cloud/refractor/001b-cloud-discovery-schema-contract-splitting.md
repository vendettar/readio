# Instruction 001b: Cloud Discovery Schema Contract Splitting

Split the remaining mixed discovery podcast contract into single-owner schemas so each active cloud path owns one explicit payload shape instead of continuing to share `DiscoveryPodcastSchema`.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: High
- **Owner Stream**: Cloud UI discovery schema boundary
- **Depends on**:
  - `001-cloud-discovery-apple-top-routes-hardening.md`
  - current cloud discovery architecture after top-route narrowing

## 2. Constraint Check

- Current intended architecture in this thread
  - Explore has exactly 3 sections:
    - Editor's Picks via PI `podcasts-batch-byguid`
    - Top Shows via Apple first-hop
    - Top Episodes via Apple first-hop
  - Search uses Apple first-hop contracts
  - Podcast detail / episode detail use PI second-hop contracts
  - RSS feed is fallback-only
- Current in-repo canonical identity contract
  - show route identity = `podcastItunesId`
  - episode route identity = canonical `episodeGuid` encoded as compact key
  - editor-pick source lookup identity = `podcastGuid`
- Current problem
  - `DiscoveryPodcastSchema` still acts as a mixed compatibility bag for multiple owners
  - this allows tests and mappers to keep old cross-source residue alive
  - schema changes ripple too broadly because one contract still spans editor picks, search/detail residue, and older compatibility fields

## 3. Problem Statement

`DiscoveryPodcastSchema` is no longer a coherent product contract.

It mixes fields from multiple sources and responsibilities:

- editor-pick / PI summary identity
- older Apple/search/feed compatibility fields
- detail-only metadata
- route-state residue that does not belong to all consumers

That makes the schema easy to misuse and hard to narrow safely.

This instruction exists to:

- stop new code from depending on `DiscoveryPodcastSchema`
- replace it with smaller schemas that each have one clear owner
- make future field deletion and contract hardening predictable

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Schemas should be split by product contract owner, not by convenience | A shared catch-all contract invites residue and weakens ownership |
| D2 | `DiscoveryPodcastSchema` should be treated as a legacy compatibility schema, not the target end state | New code should not continue binding to the mixed DTO |
| D3 | Top routes remain out of scope for this instruction | `TopPodcastSchema` and `TopEpisodeSchema` were already split in 001 |
| D4 | Editor Picks should own their own schema | Editor picks have PI-specific identity and snapshot semantics that do not belong to search or top routes |
| D5 | Detail/search schemas should only keep fields with active production readers | Schema breadth must follow current code ownership, not upstream field availability |

## 5. Affected Methods And Files

### Cloud UI

- `apps/cloud-ui/src/lib/discovery/schema.ts`
- `apps/cloud-ui/src/lib/discovery/index.ts`
- `apps/cloud-ui/src/lib/discovery/cloudApi.ts`
- `apps/cloud-ui/src/lib/discovery/editorPicks.ts`
- `apps/cloud-ui/src/hooks/useDiscoveryPodcasts.ts`
- `apps/cloud-ui/src/routeComponents/ExplorePage.tsx`
- `apps/cloud-ui/src/components/Explore/EditorPickShowCard.tsx`
- `apps/cloud-ui/src/components/Explore/EditorPickShowsCarousel.tsx`

### Likely changed-zone consumers/tests

- editor-pick tests
- explore store tests
- episode row tests that still build pseudo-podcast fixtures
- remote playback / route-state tests that still assume a mixed show schema

## 6. Required Changes

### A. Define the target schema set

This instruction should move toward the following owner model:

- `TopPodcastSchema`
  - owner: Explore Top Shows
- `TopEpisodeSchema`
  - owner: Explore Top Episodes
- `EditorPickPodcastSchema`
  - owner: Explore Editor's Picks + editor-pick route snapshot state
- `SearchPodcastSchema`
  - owner: Apple podcast search results
- `SearchEpisodeSchema`
  - owner: Apple episode search results
- `PodcastSchema` or `PodcastDetailSchema`
  - owner: PI podcast detail / second-hop enrichment
- `EpisodeSchema`
  - owner: PI episode detail/list payloads
- `ParsedFeedSchema`
  - owner: RSS fallback relay

Do not add a new generic “discovery shared podcast” schema under another name.

### B. Introduce `EditorPickPodcastSchema`

Create a dedicated editor-pick schema for the PI batch/byguid path.

It should own editor-pick-only concerns such as:

- `podcastGuid`
- `podcastItunesId`
- snapshot-safe fields needed for route state
- editor-pick card rendering fields

Do not require top-route fields that no longer belong to top shows.

### C. Stop new code from using `DiscoveryPodcastSchema`

Completion for this instruction means:

- active editor-pick consumers stop importing `DiscoveryPodcastSchema` when a narrower editor-pick schema exists
- new code must not add fields to `DiscoveryPodcastSchema`
- changed-zone tests stop casting arbitrary objects to `DiscoveryPodcast`

If some legacy path still needs `DiscoveryPodcastSchema` temporarily, document that path explicitly in code comments or the completion notes.

### D. Field ownership rules

Use these field-ownership principles when splitting:

- `podcastItunesId`
  - show-route identity
  - belongs where a show route is actually produced or consumed
- `podcastGuid`
  - editor-pick / PI source identity
  - should not leak into top-route contracts
- `url`
  - keep only where there is an active production reader
- `image` vs `artwork`
  - do not keep duplicate cover aliases unless there is a real semantic difference
- `genres`
  - keep only the shape each owner actually uses
- `providerEpisodeId`, `episodeGuid`, `audioUrl`
  - belong to episode-level contracts, not generic podcast contracts

### E. Candidate residue to remove or isolate

The split should explicitly review these fields inside `DiscoveryPodcastSchema` and either move or delete them:

- `url`
- `audioUrl`
- `providerEpisodeId`
- `episodeGuid`
- `releaseDate`
- `duration`
- `link`
- any duplicate artwork alias without an owner

Do not keep fields in the mixed schema only because tests still construct them.

### F. Migration order

Recommended order:

1. Add `EditorPickPodcastSchema`
2. Move editor-pick client parsing / types / card props to the new schema
3. Rewrite changed-zone tests to use the new editor-pick contract
4. Audit remaining `DiscoveryPodcastSchema` readers
5. Either:
   - migrate them to a narrower owner schema
   - or document why the mixed schema must temporarily remain

### G. Must Not Regress

- Do not re-widen top-show or top-episode contracts to make editor-pick migration easier
- Do not keep `DiscoveryPodcastSchema` as the default import surface for new code
- Do not encode editor-pick-only route-state assumptions into top-show components
- Do not preserve old fixture shapes through `as any`, `as unknown as`, or schema over-widening

## 7. Forbidden Outcomes

- No new mega-schema replacing `DiscoveryPodcastSchema` with the same mixed responsibility
- No top-route consumer may depend on editor-pick-only fields
- No editor-pick consumer may silently fall back to top-show-only contracts
- No fixture may keep removed fields alive only because older tests were written that way

## 8. Verification Plan

### Required Automated Verification

- `pnpm -C apps/cloud-ui typecheck`
- `pnpm -C apps/cloud-ui build`
- changed-zone vitest suites for:
  - editor-pick cards/carousels
  - explore route rendering
  - any route-state / episode-row / store tests touched by schema migration

### Required Manual Verification

1. Open Explore and confirm Editor's Picks still route through the editor-pick card path.
2. Confirm Top Shows and Top Episodes are unaffected by the editor-pick schema split.
3. Confirm editor-pick snapshot transitions still work where they are product-owned.

## 9. Acceptance Criteria

- [ ] `DiscoveryPodcastSchema` is no longer used as the default editor-pick contract
- [ ] Editor Picks have a dedicated schema with clear owner semantics
- [ ] changed-zone tests no longer cast partial editor-pick objects to the mixed schema just to stay green
- [ ] top-route contracts remain narrow after the split
- [ ] no new mixed “shared podcast” compatibility layer is introduced

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
