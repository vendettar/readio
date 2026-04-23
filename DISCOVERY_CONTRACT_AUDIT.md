# Discovery Contract Audit Instructions

## Goal

This document is an execution instruction for a new worker.

Its purpose is:

1. align any remaining discovery-related cleanup with the current codebase
2. avoid resurrecting deleted compatibility paths
3. keep future discovery work grounded in the actual current contract

This is not a historical audit report.
Do not re-apply old findings mechanically.

## Current State

The current discovery flow is already narrower than earlier audit snapshots.

### Active first-hop APIs

- Apple Search Podcasts
- Apple Search Episodes
- Apple Top Podcasts
- Apple Top Episodes
- Podcast Index `POST /podcasts/batch/byguid`

### Active second-hop / later resolution

- Podcast Index `GET /podcasts/byitunesid`
- RSS feed fetch/parse by canonical `feedUrl`

### Deleted paths that must not be restored

- Podcast Index `GET /episodes/byguid`
- Podcast Index `GET /episodes/byitunesid`
- frontend `getPodcastIndexEpisodes(...)`
- frontend/runtime `PIEpisode`
- PI-specific playback path such as `playPIEpisode(...)`

### Important current contract facts

- Episode-detail resolution is now single-path:
  1. decode compact route key into stable episode identity
  2. match cached RSS episodes by `episodeGuid`
  3. fetch canonical podcast metadata through `podcasts/byitunesid`
  4. fetch RSS by canonical `feedUrl`
  5. match by `episodeGuid`
- `SearchEpisode` no longer carries `feedUrl`.
- All actual feed fetches must come from Podcast Index `podcasts/byitunesid` canonical `feedUrl`.
- Compact keys are no longer UUID-only.
- Legacy UUID compact keys still work.
- Non-UUID stable episode identities now also compact into route keys.
- Canonical feed episodes no longer carry a `source: 'feed'` discriminator in the runtime contract.

## Non-Negotiable Rules

1. Do not restore route B in any form.
2. Do not reintroduce `PIEpisode` or any PI-episode runtime union.
3. Do not add fallback compatibility branches “just in case”.
4. Do not widen schemas to preserve stale fixtures.
5. Do not keep dead tests that preserve deleted architecture.
6. Do not document deleted routes as active.
7. Do not assume `episodeGuid` is always UUID-shaped.

## Decision Rule

For each candidate field / abstraction / test residue, evaluate:

1. Is it still produced by the current code path?
2. Is it still consumed by a real current flow?
3. Does it belong in the current normalized contract layer?

Decision table:

| Condition | Decision |
|---|---|
| Produced + consumed + belongs in current contract | Keep |
| Produced + consumed + belongs in another layer | Migrate |
| Produced but not consumed | Delete |
| Not produced but still referenced | Fix consumer and delete residue |
| Only preserved by tests/docs/comments | Delete/update residue |

## What Has Already Been Cleaned

These are already done. Do not open a new task to “fix” them again unless a fresh regression appears.

- route B (`episodes/byitunesid`) removed from cloud-api
- route B removed from cloud-ui API layer
- `PIEpisode` removed from frontend runtime/schema flow
- PI playback wrapper removed
- show/detail/episodes pages unified on RSS episode flow
- handoff docs updated to remove route B
- compact key generalized to support non-UUID stable identities

## Remaining Audit Targets

The next worker should audit only the remaining realistic areas below.

### Target A: Discovery Docs Consistency

Re-audit discovery docs against the latest implementation.

Focus files:

- `apps/docs/content/docs/apps/cloud/handoff/features/discovery.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/features/discovery.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/features/discovery-api-flow.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/features/discovery-api-flow.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/features/episode-resolution.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/features/episode-resolution.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`

Audit questions:

- Do docs still claim episode compact keys are always 22-char UUID-derived tokens only?
- Do docs still imply `episodeGuid` must be canonical UUID?
- Do docs still imply search episode first-hop can directly provide feed resolution without `podcasts/byitunesid`?
- Do docs still mention deleted PI episode routes?

Current truth that docs must match:

- route identity is a compact key derived from stable episode identity
- stable episode identity may be UUID or non-UUID
- canonical feed fetch authority is Podcast Index `podcasts/byitunesid`
- normalized RSS episode rows are keyed by `episodeGuid`, not by a `source` discriminator

### Target B: Search Episode Contract Follow-Through

Audit all search-episode consumers after the non-UUID compact key change.

Focus files:

- `apps/cloud-ui/src/components/GlobalSearch/CommandPalette.tsx`
- `apps/cloud-ui/src/components/GlobalSearch/SearchEpisodeItem.tsx`
- `apps/cloud-ui/src/hooks/useEpisodePlayback.ts`
- `apps/cloud-ui/src/components/EpisodeRow/DownloadEpisodeButton.tsx`
- `apps/cloud-ui/src/lib/player/episodeMetadata.ts`
- `apps/cloud-ui/src/hooks/useEpisodeResolution.ts`

Audit questions:

- Do all search-episode entry points now behave consistently for non-UUID `episodeGuid`?
- Is any flow still assuming UUID-only identity?
- Are playback/download/favorite metadata paths still aligned with “canonical feedUrl comes from `podcasts/byitunesid`”?

### Target C: Compact Key Contract Propagation

Audit for stale UUID-only assumptions around route identity.

Focus files:

- `apps/cloud-ui/src/lib/routes/compactKey.ts`
- `apps/cloud-ui/src/lib/routes/podcastRoutes.ts`
- `apps/cloud-ui/src/routes/podcast/$country/$id/$episodeKey.tsx`
- all tests referencing `22-character` route key wording
- discovery docs and handoff docs

Audit questions:

- Are route validators correct for both legacy UUID keys and new generic keys?
- Do any docs/tests still incorrectly assert fixed 22-char keys for all cases?
- Are any helper names or comments now misleading?

### Target D: Test/Fixture Contract Honesty

Audit changed-zone tests for stale or fabricated assumptions.

Search for:

```bash
rg -n "22-character|UUID-only|episodeGuid.*uuid|episodes/byitunesid|getPodcastIndexEpisodes|PIEpisode|playPIEpisode"
```

Rules:

- tests must not preserve deleted route B
- tests must not preserve deleted `PIEpisode`
- tests must not assume every `episodeGuid` is UUID-shaped
- tests must not fabricate stale contract fields solely to keep old expectations green

## Explicitly Out Of Scope

Do not spend time on these unless a fresh concrete bug is found:

- deleting official third-party API reference docs under `apps/docs/content/docs/general/api`
- reopening the old `PIEpisodeSchema` field audit
- reintroducing `source: 'apple'` on search DTOs
- undoing the current strict “canonical feedUrl comes from PI podcast lookup” direction

## Required Workflow

1. Start with `rg` owner searches.
2. Build a short table of real remaining mismatches.
3. Limit one execution pass to a coherent slice.
4. If the slice would touch more than 10 files, split it.
5. Update docs/tests in the same pass when contract language changes.

## Required Output

For each execution pass, return:

### Findings

| Item | Current mismatch | Decision | Files to change |
|---|---|---|---|

### Validation

List the exact commands run.

### Residual Risks

Only list real unresolved items, not already-deleted historical issues.

## Quick Validation Searches

These searches are expected to be useful before any new discovery cleanup:

```bash
rg -n "episodes/byitunesid|getPodcastIndexEpisodes|PIEpisode|playPIEpisode" apps/cloud-api apps/cloud-ui apps/docs
```

```bash
rg -n "22-character|UUID-only|uuid-only|compact key derived from `episodeGuid`" apps/docs apps/cloud-ui/src
```

```bash
rg -n "episodeGuid" apps/cloud-ui/src/components/GlobalSearch apps/cloud-ui/src/hooks apps/cloud-ui/src/lib/player apps/cloud-ui/src/routeComponents/podcast
```

## Success Condition

This instruction is complete when:

1. no deleted discovery route is described as active
2. no deleted runtime type/path is preserved by tests or code
3. compact key docs/tests match the new non-UUID-capable contract
4. search-episode flows are consistent with the canonical PI-podcast-lookup-then-RSS model
