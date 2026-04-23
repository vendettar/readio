# Instruction 024: Cloud Search Preview vs Results Query Split

Split global search into two explicit first-hop contracts so the overlay only fetches preview-sized result sets and the full search page owns its larger result set independently.

## 1. Decision Log

- **Decision**: Stop sharing one Apple search request shape between the search overlay and the `/search` results page.
- **Rationale**: The overlay currently renders only 5 podcast rows and 5 episode rows, but the shared query fetches larger result sets than it displays. That is semantically muddy and causes avoidable over-fetch.
- **Target Shape**:
  - overlay = preview query
  - search results page = full query

## 2. Required Changes

1. Introduce distinct discovery search entry points for:
   - podcast preview search
   - episode preview search
   - podcast full-results search
   - episode full-results search
2. Give preview and full-results queries different TanStack Query keys.
3. Make the overlay request only the number of rows it can actually display.
   - podcasts: 5
   - episodes: 5
4. Make the `/search` page request its own explicit result size.
   - podcasts: use the agreed full-page size
   - episodes: use the agreed full-page size
5. Do not keep a legacy “one search API for both surfaces” compatibility layer.

## 3. Scope

- `apps/cloud-ui/src/hooks/useDiscoverySearch.ts`
- `apps/cloud-ui/src/hooks/useGlobalSearch.ts` or a split companion hook if needed
- `apps/cloud-ui/src/components/GlobalSearch/CommandPalette.tsx`
- `apps/cloud-ui/src/routeComponents/SearchPage.tsx`
- related discovery search client helpers/tests only as required

## 4. Constraints

- Keep Apple first-hop ownership in the cloud discovery client layer.
- Do not widen this task into PI/detail/fallback cleanup.
- Do not preserve legacy dual-purpose signatures just to avoid touching tests.
- Prefer explicit names such as `searchPodcastsPreview` / `searchPodcastsResults` over boolean flags.

## 5. Verification

- `pnpm -C apps/cloud-ui typecheck`
- targeted vitest for:
  - search overlay behavior
  - search page behavior
  - cloud search cutover tests affected by the split

## 6. Acceptance Criteria

- overlay no longer over-fetches beyond what it displays
- `/search` page no longer depends on overlay cache shape
- preview and full-results queries have separate keys and explicit limits
- no legacy compatibility signature remains for the old shared search path
