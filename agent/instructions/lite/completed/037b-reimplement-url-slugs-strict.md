# Task: 037b - Re-Implement URL Slugs (Strict Slug-Only, No Legacy GUID Compatibility)

## Precondition (Must)
- This instruction supersedes historical `completed/037-implement-url-slugs.md` due code/doc drift.
- Product decision confirmed: no legacy compatibility requirement for raw GUID URLs.

## Objective
Implement strict episode slug routing in Lite app with one canonical format:
- Episode route param format: `{readable-title}-{shortId8}`
- New navigation links must always generate slug params.
- Resolver must resolve episodes from slug short ID, not raw GUID params.
- Raw GUID route params are invalid in this phase.

## Product Decision (Fixed)
1. Episode detail URL is slug-only:
   - `/podcast/$id/episode/$episodeId`
   - `$episodeId` must be `{titleSlug}-{shortId8}`.
2. Legacy raw GUID route params are not supported in this phase.
3. Route validation rejects non-slug params and redirects to `/podcast/$id`.
4. All internal navigation entry points must generate slug params.
5. Resolver matching authority:
   - parse slug -> `shortId8`
   - match by `episode.id.toLowerCase().startsWith(shortId8)`.
6. Collision handling must be deterministic:
   - if multiple `startsWith` matches, prefer candidate whose normalized title slug equals slug title segment;
   - otherwise pick a deterministic fallback (`pubDate` desc, then `id` lexical asc).
7. No visual/UX style changes are allowed in this instruction.

## Scope Scan (Required)
- Config:
  - No runtime config/env key changes.
- Persistence:
  - No schema or migration changes.
- Routing:
  - Tighten route param validation for slug-only behavior.
- Logging:
  - Optional debug-level logs for slug parse/match failures only.
- Network:
  - No new API endpoints.
- Storage:
  - No localStorage/IndexedDB contract changes.
- UI state:
  - Link params change only; no store model change required.
- Tests:
  - Add slug util tests + resolver tests + navigation generation tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Resolver must stay stable when feed/provider fallback queries complete out of order.
- Hot-path performance:
  - Slug parsing must be O(1) and allocation-light.
- State transition integrity:
  - Invalid slug must produce deterministic redirect, not render-loop.
- Dynamic context consistency:
  - Slug generation must be locale-agnostic and deterministic across runtime language changes.

## Implementation Steps (Execute in Order)
1. **Create slug utility module**
   - Add: `apps/lite/src/lib/slugUtils.ts`
   - Required API:
     - `generateSlug(text: string): string`
     - `generateSlugWithId(title: string, fullId: string): string`
     - `parseSlugWithId(value: string): { titleSlug: string; shortId: string } | null`
   - Rules:
     - normalize to lowercase ascii-ish word tokens (`a-z0-9` + `-`),
     - collapse repeated separators,
     - fallback title slug is `episode`,
     - `shortId` is `fullId.slice(0, 8).toLowerCase()`.

2. **Enforce slug param format at route boundary**
   - Update: `apps/lite/src/routes/podcast/$id/episode/$episodeId.tsx`
   - Replace loose `episodeId: z.string().min(1)` validation with strict slug pattern validation.
   - On invalid slug param, redirect to `/podcast/$id`.

3. **Replace raw ID param generation in all entry points**
   - Update these files to generate slug param with `generateSlugWithId(...)`:
     - `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`
     - `apps/lite/src/routeComponents/HistoryPage.tsx`
     - `apps/lite/src/routeComponents/FavoritesPage.tsx`
     - `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
   - Remove `encodeURIComponent(episode.id)` route-param usage for episode detail links.

4. **Refactor episode resolver to slug-first resolution**
   - Update: `apps/lite/src/hooks/useEpisodeResolution.ts`
   - Replace raw `decodedEpisodeId` direct-equality-first path with:
     - parse slug param using `parseSlugWithId`,
     - resolve by `id.startsWith(shortId)`,
     - apply deterministic collision strategy.
   - Keep existing provider fallback flow, but input key is slug-derived `shortId` only.
   - Do not add raw GUID fallback logic.

5. **Canonical slug enforcement on resolved episode**
   - Update: `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
   - After episode resolves, compute canonical slug via `generateSlugWithId(episode.title, episode.id)`.
   - If route param differs from canonical slug, issue `navigate(..., { replace: true })` to canonical URL while preserving existing search params.

6. **Documentation sync (atomic)**
   - Update:
     - `apps/docs/content/docs/apps/lite/routing.mdx`
     - `apps/docs/content/docs/apps/lite/routing.zh.mdx`
   - Make status explicit:
     - strict slug-only,
     - raw GUID unsupported in this phase,
     - canonicalization behavior.
   - Update handoff route architecture references:
     - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`

## Acceptance Criteria
- All episode links generated by app UI are slug-formatted (`{titleSlug}-{shortId8}`).
- Visiting a valid slug URL opens the correct episode.
- Invalid/non-slug episode params redirect to `/podcast/$id`.
- Resolver does not depend on raw GUID params.
- Canonical slug replace works when title segment is stale but short ID still matches.

## Required Tests
1. Add:
   - `apps/lite/src/lib/__tests__/slugUtils.test.ts`
   - cover normalization, empty-title fallback, parse success/failure, round-trip of `generateSlugWithId`.
2. Add:
   - `apps/lite/src/hooks/__tests__/useEpisodeResolution.slug-resolution.test.ts`
   - cover slug parse path, startsWith matching, collision tie-break, invalid slug handling.
3. Update/add navigation tests:
   - `apps/lite/src/components/EpisodeRow/__tests__/EpisodeRow.slug-link.test.tsx`
   - `apps/lite/src/routeComponents/__tests__/HistoryPage.slug-link.test.tsx`
   - `apps/lite/src/routeComponents/__tests__/FavoritesPage.slug-link.test.tsx`
   - `apps/lite/src/components/Explore/__tests__/PodcastEpisodesGrid.slug-link.test.tsx`
   - assert route params use slug format, not raw GUID.
4. Add route canonicalization test:
   - `apps/lite/src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.slug-canonical.test.tsx`
   - assert replace-navigation to canonical slug when needed.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/slugUtils.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useEpisodeResolution.slug-resolution.test.ts`
- `pnpm -C apps/lite test:run -- src/components/EpisodeRow/__tests__/EpisodeRow.slug-link.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/HistoryPage.slug-link.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/__tests__/FavoritesPage.slug-link.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Explore/__tests__/PodcastEpisodesGrid.slug-link.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.slug-canonical.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/slugUtils.ts` (new)
  - `apps/lite/src/routes/podcast/$id/episode/$episodeId.tsx`
  - `apps/lite/src/hooks/useEpisodeResolution.ts`
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
  - `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`
  - `apps/lite/src/routeComponents/HistoryPage.tsx`
  - `apps/lite/src/routeComponents/FavoritesPage.tsx`
  - `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
  - docs listed in step 6
- Regression risks:
  - broken deep links for non-slug params (intentional strict policy)
  - incorrect episode selection when short ID collisions exist
  - redirect loops during canonicalization if guard is wrong
- Required verification:
  - route validation behavior,
  - slug generation coverage across all entry points,
  - resolver correctness under feed/provider fallback.

## Forbidden Dependencies
- Do not add new routing libraries.
- Do not add server-side slug lookup services.
- Do not change visual layout/styles in this instruction.

## Required Patterns
- Centralize slug parsing/generation in one utility module.
- Keep route validation strict and explicit.
- Keep matching deterministic and test-backed.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH docs listed in step 6.
