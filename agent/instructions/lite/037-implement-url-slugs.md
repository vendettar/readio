> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement URL Slugs (Pretty Links)

## Objective
Replace raw GUIDs in URLs with readable slugs following the standard format `{readable-title}-{first8}`.
This improves shareability and SEO while maintaining reliability.

## 1. Create `apps/lite/src/lib/slugUtils.ts`
- **Function**: `generateSlug(text: string): string`.
  - Logic: Normalize text (lowercase, remove non-alphanumeric, replace spaces with hyphens).
  - **Default**: If the normalized slug is empty, return `'episode'`.
- **Function**: `generateSlugWithId(title: string, fullId: string): string`.
  - Logic: `generateSlug(title) + "-" + fullId.slice(0, 8).toLowerCase()`.
  - **MANDATORY**: Always append the first 8 characters of the GUID.
- **Function**: `extractIdFromSlug(slug: string): string`.
  - Logic: Split by the last hyphen and return the last segment (the `first8` fragment).
  - **Default**: If no hyphen exists, return an empty string and treat it as invalid.

## 2. Update Navigation Logic
- **Target**: `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`, `apps/lite/src/components/interactive/InteractiveArtwork.tsx`, and any other navigation entry points.
- **Action**: Use `generateSlugWithId(title, episodeId)` when constructing the `to` parameters for the episode detail route.

## 3. Update Route Resolver
- **Target**: `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx` (and the corresponding route definition).
- **Action**: In the loader or data fetching logic:
  - Extract the short ID using `extractIdFromSlug(params.episodeId)`.
  - Match the episode by checking if the full GUID starts with this fragment: `episodes.find(ep => ep.id.startsWith(shortId))`.
- **Constraint**: Do NOT implement a full GUID fallback. Strictly use the hybrid ID resolution logic defined in `routing.mdx`.

## 4. Verification
- **Test**: Click an episode. The URL should look like `/podcast/123/episode/the-daily-news-766f112e`.
- **Test**: Reload the page. The correct episode content should load.
- **Check**: Verify that the slug is generated consistently across different list views.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/routing.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
