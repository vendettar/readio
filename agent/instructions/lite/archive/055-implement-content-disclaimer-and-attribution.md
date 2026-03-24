> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/security.mdx` before starting.

# Task: Implement Content Disclaimer & Attribution

## Objective
Protect the platform by clearly attributing RSS content to original creators and providing a copyright reporting path.

## 1. Footer Attribution
- **Target**: `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`.
- **Action**: Add a disclaimer section at the bottom of the show-notes.
- **Text**: "Content belongs to the original creator. Readio is a player for publicly available RSS feeds." (`t('legal.attribution')`).

## 2. Copyright Reporting
- **Action**: Provide a link to the "Copyright/DMCA" section of the `/legal/privacy` page (created in Instruction 039).

## 3. Verification
- **Test**: Open an episode page. Scroll to the bottom. Verify the attribution text is visible but styled as `text-muted-foreground`.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/security.mdx` (Content ownership policy).
- Update `apps/docs/content/docs/apps/lite/routing.mdx` (legal route references).
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D018 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
