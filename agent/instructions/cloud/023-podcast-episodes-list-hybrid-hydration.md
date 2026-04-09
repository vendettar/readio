# Instruction 023: Podcast Episodes List Hybrid Hydration

## Objective
Resolve the case where a podcast show page only shows a severely truncated RSS episode list even though Apple metadata indicates much deeper history.

First-pass target:
- `PodcastShowPage` hybrid hydration only
- frontend-only merge behavior
- no backend smart-feed implementation in this task

## Problem
Some high-profile publishers truncate their public RSS feeds to only a few recent items.

That creates a broken UX:
- `podcast.trackCount` or Apple metadata implies a much larger catalog
- RSS only provides a very small recent subset
- users can see the show exists and has many episodes, but cannot access historical items from the show page

## Execution Mode
This instruction is intentionally limited to Phase 1 only.

Do:
- implement frontend hybrid hydration in `PodcastShowPage`
- keep RSS as the primary source of truth for episodes that already exist in the feed
- silently enrich missing history from Apple lookup episodes when truncation is detected

Do not do in this task:
- backend `handleFeed` smart enrichment
- new pagination system
- dedicated episodes page redesign
- search/history/favorites source rewrites

If backend smart-feed is still wanted later, open a separate follow-up instruction.

## Reproducer-First
Start with a failing reproducer test before implementation.

At minimum, cover:
1. one known truncated feed case
   - e.g. a show like NYT `Modern Love`
2. one normal non-truncated feed case

Do not hardcode behavior specifically for one publisher; use the reproducer only to lock the general contract.

## Trigger Conditions
Hybrid hydration may run only when all of the following are true:

1. `rssCount < 10`
2. `rssCount / appleTotal < 0.8`
3. a usable Apple provider identity exists for the show
   - i.e. `providerPodcastId` or equivalent trusted Apple lookup key is present
4. `appleTotal > rssCount`
5. `appleTotal` is present and parseable as a trustworthy positive integer

If Apple provider identity is missing, do not attempt supplementary hydration.
If `appleTotal` is missing, zero, invalid, or not greater than `rssCount`, do not attempt supplementary hydration.

## Data Ownership

### 1. Feed-level ownership
Feed-level show metadata remains RSS-owned in this task.

Apple supplementary hydration must not rewrite:
- show title
- show artwork
- show description
- feed URL
- publisher-level metadata already derived from RSS/feed response

### 2. Episode-level ownership
If an episode already exists in RSS, RSS remains the owner of that item for rendering and selection semantics.

Apple supplementary data is allowed only to:
- fill missing historical items
- provide enough fields for those newly added items to render and navigate correctly

Apple supplementary data must not:
- replace richer RSS HTML/content fields
- downgrade an existing RSS description to a thinner Apple summary
- become the canonical source for an episode that RSS already contains

## Core Contract

### 1. RSS-first ownership
If an episode already exists in the RSS list:
- keep the RSS episode entry
- do not replace it with Apple metadata in first pass

Reason:
- RSS entries often contain richer HTML/description/content fields
- Apple supplementary data is only for filling missing historical items

### 2. Supplementary hydration scope
Apple lookup is used only to add missing historical episodes that are absent from RSS.

It must not:
- overwrite existing RSS item fields
- rewrite feed-level metadata
- become the new primary source for the page
- become the canonical source for selected/latest episode identity when RSS already owns that item

### 3. Failure behavior
If supplementary Apple fetch fails for any reason:
- keep the original RSS list unchanged
- do not hard-fail the show page
- do not clear the already-rendered RSS episodes
- do not regress loading/CTA state

This must be a graceful enhancement, not a required dependency.

### 4. No recursive pagination in first pass
First pass should fetch only the existing supplementary episode lookup supported by current API.

Do not implement:
- recursive client pagination
- infinite Apple history walking
- repeated background page fetching

This task is about patching obvious severe truncation, not building a full history sync engine.

## Merge Contract

### 1. Dedupe key priority
Do not dedupe by raw `audioUrl` alone.

Use a stable priority order similar to:
1. normalized enclosure/audio URL
2. RSS/item GUID if available
3. title + published date as last-resort fallback

The implementation may use an equivalent helper, but it must be explicit and deterministic.
It must also fail conservatively: when identity evidence is too weak or too partial, prefer keeping distinct episodes over collapsing two possibly different items into one false-positive match.

### 2. Merge precedence
For each merged episode identity:
- prefer RSS item when both RSS and Apple refer to the same episode
- add Apple item only when RSS does not already contain that episode

### 3. Final sorting
After merge:
- sort by parsed publish date descending
- items with missing/invalid dates should be stable-last

### 4. Selection stability
The merge step must not silently break current episode selection semantics.

At minimum:
- if the currently selected episode exists in RSS before hydration, it must remain selected after merge
- if a URL param or route state identifies a current RSS episode, hydration must not remap it to a different Apple-only item
- if there is no explicit selection, default latest-item selection must be computed from the final merged list

## UI Contract

### 1. No visible UI redesign
Do not add:
- `Load more`
- `Show Apple results`
- source badges
- special truncation banners

Hydration must remain silent and automatic.

### 2. No flicker / no reset
The page may:
- render RSS episodes first
- then patch in merged historical items

It must not:
- clear the existing list before enrichment
- bounce between empty/loading and populated states

### 3. No stale overwrite on show switch
If the user navigates between shows while supplementary hydration is in flight:
- the old request result must not overwrite the new show's episode list
- only the latest relevant show/provider identity may apply a merged result

### 4. Latest episode behavior
The existing latest episode CTA/button must still resolve to the true latest item after merge.

If RSS already contains the latest item, behavior should remain unchanged.

## Recommended Implementation Direction

Likely changed zone:
- `apps/cloud-ui/src/routeComponents/podcast/PodcastShowPage.tsx`

Possible supporting helpers:
- podcast episode identity normalization
- merge helper for RSS + Apple episode arrays

Preferred structure:
1. render RSS episodes immediately
2. detect severe truncation
3. fetch supplementary Apple lookup episodes
4. merge/dedupe with RSS-first precedence
5. replace displayed list with merged result

Keep the merge logic pure and testable.
Keep async application guarded by current show identity so stale request completion cannot win after navigation.

## Observability
Add low-cardinality debug signals so this path can be verified later.

Suggested fields:
- `episodes_hydration=skipped|applied|failed`
- `episodes_hydration_reason=not_truncated|missing_provider_id|missing_apple_total|apple_not_greater|fetch_failed|applied`
- `rss_count`
- `apple_total`
- `merged_count`

These can be logs or equivalent client-safe debug instrumentation already used by the app.

Do not add high-cardinality episode-level analytics labels in this task.

## Tests
Must add or update focused tests covering:

1. truncated RSS + valid Apple history
   - merged list is larger than RSS-only list

2. non-truncated RSS
   - supplementary fetch is not triggered

3. missing providerPodcastId
   - supplementary fetch is not triggered

4. supplementary fetch failure
   - page keeps RSS episodes unchanged
   - no hard failure

5. duplicate episode identity across RSS and Apple
   - no duplicate rendered items
   - RSS item wins

6. latest episode CTA remains correct after merge

7. invalid/partial audio URL differences that still represent the same episode
   - dedupe uses normalized identity, not raw string equality only

8. stale async hydration result from show A does not overwrite show B after route change

9. weak identity evidence does not collapse distinct episodes into one false-positive dedupe

10. invalid or missing `appleTotal`
   - supplementary fetch is not triggered
   - RSS list remains unchanged

## Review Focus
Reviewer must check:

1. first pass remains frontend-only
2. Apple hydration only runs when truncation heuristic and provider identity both pass
3. merge logic is RSS-first
4. dedupe is not based on raw `audioUrl` only
5. supplementary fetch failure does not break the page
6. no UI flicker/reset was introduced
7. latest episode selection still behaves correctly
8. stale async results cannot overwrite a newer show/page state
9. dedupe logic fails conservatively rather than collapsing weak matches

## Acceptance Criteria
- [ ] Severely truncated feeds show more than the tiny RSS subset after silent hydration
- [ ] Normal feeds do not trigger unnecessary supplementary fetches
- [ ] No duplicate episodes appear after merge
- [ ] RSS items retain ownership when an episode exists in both sources
- [ ] Latest episode playback/CTA still points to the correct latest item
- [ ] Supplementary fetch failure leaves RSS behavior intact
- [ ] Show-switch / stale-response races do not corrupt the displayed episode list

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-04-09
- **Reviewed by**:
