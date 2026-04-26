# 029 Top Episode And Search Episode Direct Episode Routing

## 1. Goal

Improve episode navigation for three user entry points:

1. `Top Episodes`
2. `Search result overlay`
3. `Search result page`

The navigation contract after this change must be:

- `SearchEpisode` may use a **direct canonical route fast path** when it already carries a valid canonical episode identity
- `TopEpisode` must still use **resolver + fallback**
- when canonical direct routing is not available or resolver confidence is insufficient, the app must safely fall back to the canonical podcast show page

This task is about navigation correctness and route hygiene. It is **not** about relaxing canonical identity rules.

---

## 2. Scope

### In Scope

- `apps/cloud-ui`
- shared route-resolution helper(s) used by:
  - `Top Episodes`
  - global search overlay episode selection
  - search results page episode selection
- changed-zone tests
- this instruction's behavioral contract

### Out of Scope

- backend changes
- adding route query hints
- persistence changes
- changing single-episode detail page data-loading architecture
- changing full-feed pagination architecture

### Size Rule

- if the implementation grows beyond 10 changed files, stop and split the task
- start by adding or updating tests that reproduce the intended behavior, then implement

---

## 3. Core Decision

The three entry points do **not** have the same identity strength.

### 3.1 `SearchEpisode`

`SearchEpisode` may route directly to the canonical episode detail page **only** when it provides:

- a non-empty `podcastItunesId`
- a non-empty `episodeGuid`
- a valid route country
- a valid compact key derivable from `episodeGuid`

If and only if all of those are true, direct canonical route construction is allowed.

This is an allowed **fast path**, not a heuristic match.

Important:

- direct route construction here is allowed because the canonical episode detail page will still perform **canonical hydration** through the existing episode-detail loading path
- that means the click path may use `podcastItunesId + episodeGuid -> compactKey -> route`
- but the destination page must still load canonical podcast/feed data and resolve the canonical `FeedEpisode`

### 3.2 `TopEpisode`

`TopEpisode` does **not** carry canonical episode identity.

It must not direct-route to the episode detail page from display payload alone.

It must use:

1. canonical podcast detail lookup
2. feed-based title resolution
3. fallback to show page when resolution is missing or the current scanned page is ambiguous

---

## 4. Route Hygiene Rules

### Allowed

- use existing typed route helpers
- use `episodeGuid -> compactKey -> buildPodcastEpisodeRoute(...)`
- use canonical podcast show route helpers for fallback

### Forbidden

- do not manually concatenate `/podcast/$country/$id/$episodeKey`
- do not add query params like `feedUrl`, `audioUrl`, `title`, `source`, `sessionId`, `podcastTitle`, or similar route hints
- do not weaken `lint:route-guards`
- do not use first-hop display-only fields to invent route params

### Route Param Source Rule

For direct-route fast path:

- `country` must come from the current route/global app routing authority
- `id` must come from validated `podcastItunesId`
- `episodeKey` must come from `episodeGuid -> compactKey`

For resolver path:

- show-route fallback params must still come from canonical/validated inputs only

---

## 5. Entry-Point Contract

### 5.1 Top Episodes

When a user clicks a `Top Episodes` item:

1. do **not** direct-route from the first-hop payload
2. run the shared resolver by title
3. if the current scanned page produces exactly one allowed canonical episode route, navigate there
4. otherwise navigate to the canonical podcast show page

### 5.2 Search Result Overlay

When a user selects a `SearchEpisode` from the global search overlay:

1. first try the direct-route fast path
2. if fast path is unavailable, fall back to the canonical podcast show page
3. do **not** use title-based resolver for `SearchEpisode` clicks unless the product explicitly asks for it in a future task

### 5.3 Search Result Page

When a user clicks a `SearchEpisode` from the dedicated search page:

1. use the exact same fast-path-or-show fallback contract as the search overlay
2. do not let search page and search overlay diverge

The overlay and page must stay behaviorally identical for `SearchEpisode` navigation.

---

## 6. Shared Resolution Design

There are now two distinct shared helpers or helper branches:

### 6.1 Direct Route Fast Path

Recommended narrow helper:

- input:
  - `country`
  - `podcastItunesId`
  - `episodeGuid`
- output:
  - canonical episode route or `null`

Rules:

- no feed fetch
- no podcast-detail lookup
- no title matching
- no fallback query params
- fail closed if any required route segment cannot be built

### 6.2 TopEpisode Title Resolver

Recommended narrow helper:

- input:
  - `queryClient`
  - `country`
  - `podcastItunesId`
  - target title
- output:
  - canonical episode route when the current scanned page yields one exact-title match
  - otherwise canonical podcast show route

This helper is for `TopEpisode` only in this task.

---

## 7. Resolver Preconditions

Before running title resolution:

- `country` must normalize successfully
- `podcastItunesId` must be present and non-empty
- target title must normalize to a non-empty string

If any precondition fails:

- do not fetch feed pages
- do not attempt title matching
- fall back safely to the show page

---

## 8. Resolver Algorithm

The title resolver must follow this exact flow:

1. validate inputs
2. fetch canonical podcast detail using existing query helpers
3. read canonical `feedUrl`
4. if `feedUrl` is missing, fall back to show page
5. fetch feed pages page-by-page using the existing shared feed query/cache helpers
6. scan episodes in feed order
7. collect normalized exact-title matches within the current scanned page
8. stop immediately once the current page can determine a result
9. return:
   - episode route if the current scanned page yields exactly one normalized exact-title match
   - otherwise show route

Do not introduce a second bespoke feed-fetch path.

---

## 9. Matching Rule

### Allowed Match Rule

Use only:

- normalized exact title equality

### Forbidden Match Rule

Do not use:

- fuzzy matching
- substring matching
- token overlap scoring
- “pick the newest”
- “pick the first”
- “pick the first match and stop”

---

## 10. Title Normalization Rule

Use a lightweight normalization routine.

Normalize:

- leading/trailing whitespace
- repeated internal whitespace
- case differences
- Unicode normalization
- curly quotes vs straight quotes
- common hyphen/dash variants

Do not add heavy text-matching libraries.

---

## 11. Uniqueness Rule

This point is critical.

### Definition

For this task, a result is **resolved** only if:

- exactly one normalized exact-title match is found on the current scanned page
- within the allowed scan window

### Important Consequence

Do **not** fetch an additional page solely to disambiguate a match already found on the current page.

If one match is found on the current page:

- if a second exact-title match is also found on that same page -> ambiguous -> fallback to show page
- otherwise return the matched episode route immediately

Later pages must not be fetched just to prove cross-page uniqueness.

### Window Semantics

Resolution in this task means:

- exact-title matching within the current scanned page
- not globally unique across the entire historical feed

Duplicates on later pages are intentionally ignored by this task.

---

## 12. Performance Cutoffs

These are work-limiting heuristics only.

They are **not** identity rules.

### Cutoff A: 30-Day Date Window

- stop scanning when the current feed item is older than `now - 30 days`

### Cutoff B: 60 Episodes Scanned

- stop after scanning 60 feed episodes total

### Clock Rule

- freeze `now` once per resolver attempt
- compare using timestamps, not repeated rolling `Date.now()` calls

### Invalid Date Rule

- if `pubDate` is missing or invalid, that item must not trigger the date cutoff
- continue scanning until:
  - a later valid old item crosses cutoff, or
  - the scan cap is reached, or
  - feed is exhausted, or
  - ambiguity is found

---

## 13. Feed Ordering Assumption

The 30-day cutoff is valid only because this resolver assumes the scanned feed pages are effectively newest-first.

Required instruction to worker:

- rely on the existing feed pagination contract as descending publish order for canonical feed scanning
- do not introduce custom client-side sorting
- invalid/missing dates must not be allowed to prematurely terminate scanning

---

## 14. Terminal Conditions

Once any terminal condition is reached, stop the resolver immediately and do not request another page.

Terminal conditions:

- second exact-title match found on the current page -> ambiguous
- one exact-title match found on the current page with no second same-page match
- date cutoff crossed
- scan cap reached
- feed exhausted
- canonical podcast detail lookup failed
- canonical feed fetch failed
- required input invalid

After a terminal condition:

- do not fetch next page
- do not continue scanning
- return final route immediately

---

## 15. Cache / Fetching Rules

The implementation must reuse the existing discovery query/cache contract.

Required behavior:

- reuse existing podcast detail query keys
- reuse existing feed query keys
- use the existing query-helper layer rather than ad-hoc `fetch()` calls
- benefit from warm first pages if the user recently visited a show page
- fetch feed pages incrementally using the shared pagination contract

Forbidden behavior:

- no direct `discovery.fetchPodcastFeed(...)` from a bypass path when a shared query helper exists
- no bespoke resolver-only feed cache
- no full-feed fetch fallback
- no separate cache namespace for this task

---

## 16. Persistence Boundary

These routing decisions are navigation-only.

Do not:

- persist heuristic title matches into favorites/history/download/session rows
- write guessed canonical identity into DB records
- backfill resolver output into stored playback/session entities

Direct-route `SearchEpisode` fast path is allowed for navigation only.

---

## 17. Files To Review First

- `apps/cloud-ui/src/components/Explore/PodcastEpisodesGrid.tsx`
- `apps/cloud-ui/src/components/GlobalSearch/CommandPalette.tsx`
- `apps/cloud-ui/src/components/GlobalSearch/SearchEpisodeItem.tsx`
- `apps/cloud-ui/src/routeComponents/SearchPage.tsx`
- `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
- `apps/cloud-ui/src/lib/routes/podcastRoutes.ts`
- `apps/cloud-ui/src/lib/routes/compactKey.ts`
- `apps/cloud-ui/src/lib/discovery/queryCache.ts`
- `apps/cloud-ui/src/lib/discovery/podcastQueryContract.ts`
- `apps/cloud-ui/src/hooks/useEpisodeResolution.ts`

---

## 18. Tests Required

At minimum, add or update coverage for the following.

### 18.1 Top Episodes

- current-page exact-title match navigates to episode detail page
- zero matches falls back to show page
- multiple exact-title matches on the same page falls back to show page
- resolver does not fetch another page merely to check whether a later duplicate exists
- resolver stops scanning when cutoff is crossed
- resolver stops after 60 scanned episodes
- resolver does not request another page after a terminal condition

### 18.2 Search Result Overlay

- direct-route fast path is used when `podcastItunesId + episodeGuid + valid country` are present
- direct-route fast path does not trigger podcast-detail lookup
- direct-route fast path does not trigger feed-title resolution
- invalid/missing direct-route inputs fall back safely to show page

### 18.3 Search Result Page

- same direct-route fast path as overlay
- same fallback behavior as overlay
- no divergence between search page and overlay behavior

### 18.4 Fast Path Contract

- valid `SearchEpisode` with `episodeGuid + podcastItunesId` builds canonical episode route
- empty/invalid `episodeGuid` does not build canonical route
- empty/invalid `podcastItunesId` does not build canonical route
- direct-route path does not add route query hints

### 18.5 Resolver Edge Cases

- blank or whitespace-only title falls back without feed fetch
- podcast detail lookup failure falls back safely
- feed fetch failure falls back safely
- missing `feedUrl` falls back safely
- invalid/missing `pubDate` does not trigger date cutoff by itself
- normalized-equivalent titles match
- duplicate title on a later page may be ignored by design

### 18.6 Contract / Hygiene

- no route query hints are introduced
- existing route-hygiene expectations remain intact
- `lint:route-guards` still passes
- no full-feed fetch is reintroduced
- shared query helpers are reused

---

## 19. Validation

Before closing the task, run:

- targeted vitest files for:
  - `PodcastEpisodesGrid`
  - `CommandPalette`
  - `SearchEpisodeItem`
  - resolver helper tests
- `pnpm -C apps/cloud-ui typecheck`
- `pnpm -C apps/cloud-ui lint:route-guards`

---

## 20. Acceptance Criteria

- `Top Episodes` uses title resolver and can open episode detail when the current scanned page yields exactly one normalized exact-title match
- `Top Episodes` falls back to show page on missing, same-page ambiguous, or failed resolution
- `Search result overlay` direct-routes to canonical episode detail when valid `podcastItunesId + episodeGuid` are present
- `Search result page` uses the same direct-route fast path contract as overlay
- search overlay and search page behavior do not diverge
- direct-route fast path does not perform title-based feed scanning
- canonical episode detail page continues to hydrate data through the existing canonical resolution path after navigation
- no route query hints are introduced
- no full-feed fetch is introduced
- existing shared query/cache helpers are reused
- route identity remains based on canonical `episodeGuid -> compactKey`

---

## 21. Notes

- `SearchEpisode` direct route is allowed in this task because the destination episode page still performs canonical hydration
- `TopEpisode` still requires resolver work because it lacks canonical episode identity
- `30 days` and `60 episodes` are defaults, not universal truth
- do not silently promote current-page title matching into a stronger cross-page uniqueness contract than defined above
