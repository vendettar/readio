# Discovery Contract Audit Instructions

## Goal

This document is an execution instruction for future discovery cleanup.

Its purpose is:

1. align future discovery work with the current codebase
2. avoid resurrecting deleted RSS/feed architecture
3. keep discovery ownership grounded in the current PI-first contract

This is not a historical report.
Do not mechanically re-apply old findings.

## Current State

The current discovery flow is narrower than earlier audit snapshots.

### Active first-hop APIs

- Apple Search Podcasts
- Apple Search Episodes
- Apple Top Podcasts
- Apple Top Episodes
- Podcast Index `POST /podcasts/batch/byguid`

### Active second-hop / later resolution

- Podcast Index `GET /podcasts/byitunesid`
- Podcast Index `GET /episodes/byitunesid?max=1000`

### Deleted paths that must not be restored

- RSS feed fetch/parse for page rendering
- any Cloud route that fetches or parses feed XML for show / episodes / detail pages
- Podcast Index `GET /episodes/byguid`
- frontend/runtime feed-owned episode DTOs
- feed-keyed page caches

### Important current contract facts

- Episode-detail resolution is now PI-owned:
  1. decode compact route key into stable episode identity
  2. fetch canonical podcast metadata through `podcasts/byitunesid`
  3. fetch the PI episode list through `episodes/byitunesid?max=1000`
  4. match by stable `episodeGuid`
- Show page, episodes page, and cold-open detail page all use the same PI episode-list ownership model.
- Repo-owned Cloud runtime contracts no longer expose or depend on the legacy feed transport field.
- `SearchEpisode` no longer carries feed-owned routing state.
- Compact keys are no longer UUID-only.
- Legacy UUID compact keys still work.
- Non-UUID stable episode identities also compact into route keys.

## Non-Negotiable Rules

1. Do not restore any RSS/feed fallback for page rendering.
2. Do not reintroduce feed-keyed page caches or route identity.
3. Do not add compatibility branches “just in case”.
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

- page rendering is no longer RSS-owned
- Cloud discovery feed route is retired
- frontend/runtime feed normalization helper is deleted
- Cloud show / episodes / detail pages are unified on PI episode-list ownership
- repo-owned runtime contracts no longer expose the legacy feed transport field
- compact key generalized to support non-UUID stable identities

## Remaining Audit Targets

The next worker should audit only realistic remaining areas below.

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

- Do docs still imply page rendering depends on RSS/feed XML?
- Do docs still imply compact keys are UUID-only?
- Do docs still imply direct routing relies on legacy feed-owned hints?
- Do docs still mention deleted routes as active?

Current truth that docs must match:

- route identity is a compact key derived from stable episode identity
- stable episode identity may be UUID or non-UUID
- canonical page-rendering ownership is PI podcast lookup + PI episode list
- normalized episode rows are keyed by `episodeGuid`

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

- Do all search-episode entry points behave consistently for non-UUID `episodeGuid`?
- Is any flow still assuming UUID-only identity?
- Are playback/download/favorite metadata paths aligned with PI-owned page rendering rather than feed-owned routing?

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

## Explicitly Out Of Scope

Do not spend time on these unless a fresh concrete bug is found:

- deleting official third-party API reference docs under `apps/docs/content/docs/general/api`
- historical completed instructions and archived review notes
- reintroducing source discriminators or feed-owned runtime unions

## Required Workflow

1. Start with `rg` owner searches.
2. Build a short table of real remaining mismatches.
3. Limit one execution pass to a coherent slice.
4. If the slice would touch more than 10 files, split it.
5. Update docs/tests in the same pass when contract language changes.

## Success Condition

This instruction is complete when:

1. no deleted discovery route is described as active
2. no deleted feed-owned runtime path is preserved by live code
3. compact key docs/tests match the non-UUID-capable contract
4. search-episode flows are consistent with the PI podcast lookup + PI episode-list model
