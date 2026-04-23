# Task: 101 - Extract Reusable Premium Action Toggle and Expandable Description [COMPLETED]

## Objective
Extract repeated premium interaction patterns from podcast pages into reusable UI components without changing current user-visible behavior.

## Product Decision (Fixed)
1. Add `apps/lite/src/components/ui/action-toggle.tsx` for icon-morph action buttons.
2. Add `apps/lite/src/components/ui/expandable-description.tsx` for truncated/expandable descriptions.
3. Keep current page layout, spacing, and visual language in:
   - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
   - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
4. `ActionToggle` implementation must use existing CSS transition approach; do not add Framer Motion dependency to this component.
5. `ExpandableDescription` must support two explicit rendering modes:
   - `plain`: render sanitized plain text (for show page description path)
   - `html`: render sanitized HTML string (for episode detail rich description path)
6. Preserve existing semantics:
   - subscribe/favorite handlers unchanged
   - aria labels unchanged
   - show-more/show-less behavior unchanged.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - Behavior-preserving extraction only.
- Tests:
  - Add component tests for extracted primitives and page wiring parity checks.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Toggle callbacks remain synchronous wrappers around existing async page handlers.
- Hot-path performance:
  - Prevent unnecessary rerenders by keeping extracted components prop-driven and stateless where possible.
- State transition integrity:
  - icon/label transitions must remain deterministic across quick toggles.
- Dynamic context consistency:
  - translation-driven labels (`subscribe`, `favoritesAdd`, `showMore`, `showLess`) must remain live with language changes.

## Implementation Steps (Execute in Order)
1. **Create `ActionToggle` component**
   - Add:
     - `apps/lite/src/components/ui/action-toggle.tsx`
   - Required props:
     - `active: boolean`
     - `onToggle: () => void`
     - `activeIcon: LucideIcon`
     - `inactiveIcon: LucideIcon`
     - `activeLabel?: string`
     - `inactiveLabel?: string`
     - `activeAriaLabel: string`
     - `inactiveAriaLabel: string`
     - `size?: 'compact' | 'default'`
     - `className?: string`
   - Required behavior:
     - preserve icon morph transition pattern
     - support icon-only collapsed mode when active
     - keep current focus/hover/active semantics via existing Button primitives.

2. **Create `ExpandableDescription` component**
   - Add:
     - `apps/lite/src/components/ui/expandable-description.tsx`
   - Required props:
     - `content: string`
     - `mode: 'plain' | 'html'`
     - `collapsedLines?: 2 | 3 | 4`
     - `expanded: boolean`
     - `onExpandedChange: (next: boolean) => void`
     - `showMoreLabel: string`
     - `showLessLabel: string`
     - `maxWidthClassName?: string`
   - Required behavior:
     - in `plain` mode, use the exact existing path from show page:
       - `stripHtml(content, { preserveLineBreaks: true })`
       - do not add extra whitespace normalization beyond the current output contract.
     - in `html` mode, use the exact existing path from episode detail:
       - `sanitizeHtml(content)` before render (`dangerouslySetInnerHTML` path).
     - preserve current gradient fade + inline show-more affordance behavior.

3. **Refactor show page to extracted components**
   - Update:
     - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
   - Replace inline subscribe morph button with `ActionToggle`.
   - Replace inline expandable description block with `ExpandableDescription` in `plain` mode.
   - Keep button placement and surrounding layout classes unchanged.

4. **Refactor episode detail page to extracted components**
   - Update:
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
   - Replace inline favorite morph button with `ActionToggle`.
   - Replace description expansion block with `ExpandableDescription` in `html` mode.

5. **Docs sync (atomic)**
   - Update docs to mark these premium interaction patterns as shared UI primitives.

## Acceptance Criteria
- Subscribe and favorite buttons behave exactly as before, including morph transitions and aria labels.
- Show and episode descriptions preserve current truncation/expansion behavior.
- Show page uses `plain` description mode; episode detail uses `html` description mode.
- `plain`/`html` mode sanitation functions match current implementation contracts exactly.
- Inline duplicated morph/expand logic is removed from both pages.

## Required Tests
1. Add:
   - `apps/lite/src/components/ui/__tests__/action-toggle.test.tsx`
   - Assert aria label switching, active/inactive icon visibility class toggles, and click behavior.
2. Add:
   - `apps/lite/src/components/ui/__tests__/expandable-description.test.tsx`
   - Assert plain/html mode rendering, collapsed/expanded toggling, and show-more/show-less behavior.
3. Add or update page-level tests:
   - `apps/lite/src/routeComponents/podcast/__tests__/PodcastShowPage.actions.test.tsx`
   - `apps/lite/src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.actions.test.tsx`
   - Assert action callbacks and key labels still render and trigger correctly.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/ui/__tests__/action-toggle.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/ui/__tests__/expandable-description.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/podcast/__tests__/PodcastShowPage.actions.test.tsx`
- `pnpm -C apps/lite test:run -- src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.actions.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/ui/action-toggle.tsx` (new)
  - `apps/lite/src/components/ui/expandable-description.tsx` (new)
  - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
  - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
  - tests under:
    - `apps/lite/src/components/ui/__tests__/`
    - `apps/lite/src/routeComponents/podcast/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/discovery.zh.mdx`
    - `apps/docs/content/docs/general/design-system/components.mdx`
    - `apps/docs/content/docs/general/design-system/components.zh.mdx`
- Regression risks:
  - subtle spacing drift in hero action area
  - show-more visual drift on long descriptions
  - aria label mismatch after extraction
- Required verification:
  - extracted component tests pass
  - podcast page interaction tests pass
  - full lite test suite and build pass

## Forbidden Dependencies
- Do not add new animation libraries.
- Do not change subscription/favorite business logic.
- Do not alter route or data-fetch flow.

## Required Patterns
- Use shared `Button` primitive and existing utility classes.
- Keep extraction presentational and behavior-preserving.
- Keep i18n labels passed from page level.

## Decision Log
- Required: No (behavior-preserving component extraction).

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/components/ui/__tests__/action-toggle.test.tsx`
  - `pnpm -C apps/lite test:run -- src/components/ui/__tests__/expandable-description.test.tsx`
  - `pnpm -C apps/lite test:run -- src/routeComponents/podcast/__tests__/PodcastShowPage.actions.test.tsx`
  - `pnpm -C apps/lite test:run -- src/routeComponents/podcast/__tests__/PodcastEpisodeDetailPage.actions.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
