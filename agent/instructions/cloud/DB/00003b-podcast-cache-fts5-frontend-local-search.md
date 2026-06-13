# Instruction 00003b: Podcast Cache FTS5 Frontend Local Search

Discuss and approve this document before implementation.

This instruction integrates the backend cache-search API into the Cloud search local-results composition.

Do not start until `00003a` is implemented and verified.

## Execution Metadata

- Decision Log: Required
- Bilingual Sync: Not applicable
- Pre-Implementation 8-Scope Scan: Required
- Reviewer Evidence Surface: Required

## 1. Goal

Show cached PodcastIndex search hits in the local-results side of Cloud search without changing Apple global search.

## 2. Scope

Owns:

- Cloud UI cached-search client helper
- cached result schemas/types
- `useLocalSearch` composition
- `useGlobalSearch` only if type plumbing requires it
- CommandPalette local-section rendering
- SearchPage local-section rendering if it already consumes `useGlobalSearch`
- local search click actions
- frontend tests

Does not own:

- backend FTS implementation
- docs handoff sync
- Apple search hooks or API behavior
- replacing browser-local IndexedDB search for subscriptions, favorites, history, files, or downloads

## 3. Required Result Types

Add explicit local result types:

- `cachedPodcast`
- `cachedEpisode`

Do not reuse:

- `subscription`
- `favorite`
- `history`
- `file`
- `download`

Add a distinct badge/i18n label for backend cache hits, for example "Cached" / "已缓存". Do not label these results as "Your Library" unless the surrounding UI copy makes clear that cached results are separate from the user's private library.

## 4. Composition Rules

- `useDiscoverySearch` remains Apple global search only.
- `useLocalSearch` must fetch cached search results from `/api/v1/discovery/search/cache`.
- Cached search loading/error state must not block Apple results.
- Cached search errors must degrade to no cached results and log through existing sanitized frontend logging.
- Search query debounce must align with existing local DB search debounce.
- Overlay limit must request no more than the local section can display.
- Full SearchPage may use a larger explicit limit only if the UI has a distinct full-page local section contract.
- Do not change `useDiscoverySearch` query keys, Apple API route ownership, or Apple result schemas in this instruction.

## 5. Dedupe And Identity

Use canonical identities:

- cached podcast: `podcastItunesId`
- cached episode: `podcastItunesId + episodeGuid`

When a cached episode overlaps with a favorite/history/download result, merge badges without replacing the user-owned result as primary. User-owned records have higher display priority than backend cache hits.

Cached podcast hits must dedupe against subscription records by `podcastItunesId`, with subscription remaining primary.

## 6. Click Behavior

- `cachedPodcast` routes to the canonical podcast show page.
- `cachedEpisode` routes to the canonical episode page.
- Cached results use the current global content country from Explore state.
- If the current global content country is unavailable, fall back to the configured default country.
- Do not use browser-local `countryAtSave` for cached results because cached hits are not saved library records.
- Do not perform a PodcastIndex refresh merely because the result was clicked. Normal page routing may use existing page bootstrap behavior.

## 7. UI Copy Boundary

The existing local section currently represents user-local material. After this integration, UI copy must not imply backend cached hits are private library items.

Required decision during implementation:

- either split local section labels into user-library and cached-results subsections
- or use one broader local section title plus explicit per-result cached badges

The implementation report must state which option was chosen.

## 8. Frontend Tests

Required tests:

- Apple result sections render independently when cached search is loading
- Apple result sections remain visible when cached search fails
- cached podcast appears only as `cachedPodcast`
- cached episode appears only as `cachedEpisode`
- cached hits are not labeled as subscription/favorite/history/file/download
- cached podcast click routes to show page
- cached episode click routes to episode page
- cached podcast/episode routes use current global content country, with configured default country fallback
- cached routes do not use browser-local `countryAtSave`
- cached episode dedupes with favorite/history using `podcastItunesId + episodeGuid`
- subscription/favorite/history remain primary when deduping with cached hits

## 9. Verification

Run:

```bash
pnpm -C apps/cloud-ui typecheck
pnpm -C apps/cloud-ui test:run
```

Implementation report must include:

1. changed result types
2. chosen UI label/subsection strategy
3. cached-search client route
4. dedupe behavior
5. country routing behavior
6. verification command results

## 10. Pre-Implementation 8-Scope Scan

Before coding, scan and report the exact intended touch points for:

1. cached-search client/schema files
2. local/global search hooks
3. result type definitions
4. local search action/routing code
5. CommandPalette rendering
6. SearchPage rendering
7. i18n labels
8. frontend tests

If the scan predicts more than 10 files for 00003b, stop and split 00003b further before implementation.

## 11. Reviewer Evidence Surface

Reviewers must inspect:

- `cachedPodcast` / `cachedEpisode` type separation
- no Apple search hook/schema/query-key changes
- local section UI copy and badge behavior
- country routing source and fallback
- dedupe priority against user-owned library records
- cached search loading/error isolation from Apple results
- frontend verification command output
