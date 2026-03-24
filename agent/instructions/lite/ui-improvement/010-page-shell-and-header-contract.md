# Task: Page Shell and Header Contract

## Goal
Define and implement one reusable page shell and header contract for Lite route-level pages so `Explore`, `Search`, `History`, `Favorites`, `Files`, `Downloads`, and `Settings` share the same top-level structure, action placement rules, and text overflow behavior without introducing a new visual direction.

## Status
- [ ] Active
- [ ] Completed

## Recommended Order
1. This task should run before any Phase 1 follow-up that standardizes row/list surfaces or status badges.

## Depends On
- `agent/instructions/lite/ui-improvement/001-ui-improvement-roadmap.md`
- Current Lite design-system and UI-pattern SSOT docs

## Can Run In Parallel
- No with other page-shell/header tasks in the same route cluster.
- Yes with unrelated non-UI or non-shell work that does not edit the same route headers or shell docs.

## Read First (Required)
- `apps/docs/content/docs/index.mdx`
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/general/design-system/index.mdx`
- `apps/docs/content/docs/general/design-system/components.mdx`
- `apps/docs/content/docs/general/design-system/tokens.mdx`
- `apps/docs/content/docs/general/design-system/visuals.mdx`
- `apps/docs/content/docs/general/accessibility.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/technical-roadmap.mdx`
- `apps/docs/content/docs/general/feature-backlog.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/settings.mdx`

## Phase Boundary (Strict)
This instruction is a Phase 1 contract task from `001-ui-improvement-roadmap.md`.

It may:
- define a reusable page shell contract
- define a reusable route header contract
- normalize header action placement and stacking rules
- define route-title, subtitle, support-meta, and text-overflow policies
- extract or reuse durable shared UI building blocks when repeated usage justifies them
- update UI-pattern/handoff docs if the final contract becomes the new durable standard

It may not:
- redesign route identity or introduce a new visual language
- standardize loading / empty / error / partial-data state modeling beyond shell geometry preservation already needed for header continuity
- absorb row/list surface rules that belong in the row/list contract task
- change overlay, portal, focus-restore, search panel, player, or transcript interaction semantics
- restyle discovery hero/detail surfaces beyond adopting the shared shell/header contract
- rewrite route data flow, persistence behavior, or network timing

If implementation pressure starts to pull this task into route-state modeling or overlay behavior, stop and split that work into the proper follow-up task.

## Problem
Lite route pages currently share broad layout tokens (`max-w-content`, `px-page`, `pt-page`) but not one explicit route-shell/header contract. Existing pages diverge in:
- header spacing (`mb-8`, `mb-10`, `mb-12`)
- title scale and subtitle rhythm
- whether actions sit inside the main header row or below it
- whether metadata chips/counts are treated as part of the header contract or page-specific decoration
- text handling for long route titles such as folder names and search queries
- mobile stacking behavior when header text and action controls compete for width

This drift makes the product feel like independently evolved pages instead of one system.

## Current Contract
- Most pages use `max-w-content mx-auto px-page pt-page`, but shell wrappers are duplicated route-by-route.
- `Files` is the only route with a dedicated page-header component and separate `ViewControlsBar`.
- `Settings` uses a distinct hero-like header shell with chips and background treatment that does not map cleanly to the other route headers.
- `Search` renders the query as the main title without a documented overflow rule.
- `History` and `Favorites` use simple title/subtitle headers with no documented action rail behavior.
- `Downloads` places `ViewControlsBar` below the header but does not share the same reusable header wrapper as `Files`.

## Target Contract
All Phase 1 library/discovery/settings route pages listed in scope should compose from one documented shell contract with:
- a shared page container and vertical rhythm
- one reusable route header structure
- one documented header action-rail placement model
- one documented support-meta area policy
- one documented text-overflow policy for titles, subtitles, counts, and action labels

The target is consistency of contract, not visual sameness of every child section.

## Minimum Header Elements
The reusable header contract must explicitly define:
- required: `title block` (title + optional subtitle)
- optional: `action rail` (page-level actions only)
- optional: `support meta` (counts/chips/context labels)

Rules:
- When `action rail` is absent, do not reserve empty space; preserve vertical rhythm.
- When `support meta` is absent, do not render placeholder rows.
- When `action rail` is present, it must align to one documented placement model across routes.
- Any use of a back/close affordance must be documented and limited to nested routes only, not the top-level library routes.

## Delta
- Replace route-local top-of-page header composition drift with one reusable contract or one clearly shared pattern family.
- Constrain visual differences to documented route-specific needs instead of ad hoc spacing/classes.
- Convert current long-title handling from implicit browser behavior into explicit, tested overflow rules.
- Keep route-specific content below the header intact unless a shell/header change is required for the contract.

## Scope

### In Scope
- Route shell for:
  - `apps/lite/src/routeComponents/ExplorePage.tsx`
  - `apps/lite/src/routeComponents/SearchPage.tsx`
  - `apps/lite/src/routeComponents/FavoritesPage.tsx`
  - `apps/lite/src/routeComponents/HistoryPage.tsx`
  - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
  - `apps/lite/src/routeComponents/DownloadsPage.tsx`
  - `apps/lite/src/routeComponents/SettingsPage.tsx`
- Existing shared header/supporting components that should host the new contract
- Any new shared page-shell/header component needed for durable reuse
- Documentation updates in Lite `ui-patterns` and/or relevant handoff sub-docs if the contract becomes durable SSOT

### Out of Scope
- Row/card density rules
- Route-level empty/error/loading semantics except preserving shell/header geometry where needed
- Search result list structure
- Discovery hero composition
- Settings section card internals
- Player/transcript/search overlay semantics
- Persistence/config/network behavior

## Product Decision (Locked)
1. This task is a contract-hardening task, not a redesign task.
2. All affected routes must keep their current product meaning, navigation, and action availability.
3. The contract must be reusable and documented; route-local convenience classes are not sufficient if drift remains.
4. Text overflow handling must be explicit and testable for both English and long mixed-language content.

## Scope Scan (8 Scopes)
- Config & env parsing:
  - No new runtime config or env contract.
- Persistence & data integrity:
  - No persistence schema change.
  - Existing density/settings/local preferences may be read as before but must not be redefined by this task.
- Routing & param validation:
  - No route-path or param contract change.
  - Search query and folder-name display rules may change visually, but route parsing must remain unchanged.
- Logging & error handling:
  - No new logging path required.
- Network & caching:
  - No network or cache policy change.
- Storage & serialization:
  - No storage serialization change.
- UI state & hooks:
  - Shared shell/header state derivation is allowed if it stays presentation-scoped.
  - Do not introduce global shell state for simple header composition.
- Tests & mocks:
  - Add or update component/route tests that verify header rendering, stacking, and text-overflow class application.
  - Reuse existing test infrastructure; no new mock architecture.

## Hidden Risk Sweep
- Async control flow:
  - Avoid introducing header components that fetch or derive async data internally.
  - Do not move existing route data-fetching responsibilities into shared shell components.
- Re-entrancy:
  - Header action callbacks must remain route-owned; shared components should render controls, not own business logic.
- Hot-path performance:
  - Do not create broad store subscriptions in shared shell/header components.
  - Use atomic selectors where a header needs store data.
- Cache drift:
  - None expected because this task must not alter data loading or query behavior.

## Dynamic Context Consistency
The contract must define behavior under:
- long translated strings
- long search queries
- long folder names
- mixed RTL/LTR and multilingual content
- narrow mobile widths
- desktop widths where action controls can remain inline

Do not hardcode behavior that only works for short English labels.

## Required Changes

### 1. Define one page shell contract
Create or standardize a shared route-level shell contract that all in-scope pages use.

Minimum contract requirements:
- keep existing page-width source of truth aligned with current tokens (`max-w-content`, `px-page`, `pt-page`, route-appropriate bottom padding)
- define one standard vertical relationship between:
  - top page container
  - route header
  - optional support controls directly under the header
  - main content section
- remove route-local one-off header spacing where the same spacing rule should apply across pages
- preserve scroll/container behavior already used by the route unless the new contract explicitly replaces it

### 2. Define one header structure contract
The shared header contract must explicitly model these zones:
- `title block`
  - required
  - contains title and optional subtitle/support copy
- `action rail`
  - optional
  - contains page-level actions only, such as add/import/create controls or density/view controls when they belong to the top-of-page command area
- `support meta`
  - optional
  - contains summary chips/counts/context labels only when the route genuinely needs them

The contract must define when a route may omit a zone and when it must render an empty wrapper versus not rendering the zone at all.

### 3. Define header layout and stacking rules
The instruction implementation must encode these layout rules:
- desktop/tablet:
  - title block and action rail may sit in the same horizontal row when both can fit without forcing unreadable text compression
- mobile/narrow widths:
  - action rail must wrap below the title block rather than forcing the title into unreadable truncation
- support meta:
  - if present, it must sit below the primary title/subtitle row, not compete with the primary title for horizontal space
- secondary controls such as `ViewControlsBar`:
  - may remain below the header if they are shared route-view controls rather than primary page actions
  - the contract must say this explicitly so `Files` and `Downloads` stay aligned without overloading the primary action rail

### 4. Define text overflow policy
The contract must encode route-header text handling with explicit acceptance rules.

Required title rules:
- route titles that are stable, short product nouns such as `Explore`, `History`, `Favorites`, `Downloads`, and `Settings`:
  - must not be artificially truncated under normal supported breakpoints
- dynamic titles such as current folder names and raw search queries:
  - must use explicit overflow behavior
  - default rule:
    - allow up to two lines on narrow widths with `line-clamp-2` or equivalent documented behavior
    - collapse to a single-line `truncate` behavior only where preserving action-rail integrity is more important and the route has an alternate way to recover the full string
- quoted search queries:
  - must not visually break the page shell when the query is long, whitespace-heavy, or contains CJK characters
- title wrappers must use `min-w-0` when placed in flex rows so truncation/clamping actually works

Required subtitle/support-copy rules:
- descriptive subtitles should prefer wrapping to a second line rather than single-line ellipsis when they provide primary route context
- subtitles longer than two lines on mobile should clamp to two lines if they materially expand the header and push core actions below the fold
- purely supplemental counts or context labels should truncate in constrained horizontal layouts instead of wrapping indefinitely

Required action-label rules:
- action buttons in the header must preserve readable labels at common mobile widths
- if two labeled actions cannot fit while preserving readable text, the layout must stack or wrap actions rather than clipping button labels
- do not solve width pressure by replacing standard labeled actions with icon-only buttons unless the route already has a documented icon-only pattern and tooltip coverage
- **any pure icon-only buttons (e.g., back, settings, search) placed in the header must contain an explicit `aria-label` and enforce a minimum touch target size of 44x44px for mobile accessibility.**

Required support-meta rules:
- summary chips/counts must wrap cleanly
- individual chips should remain single-line
- chip rows may wrap to multiple lines
- chip text should truncate only if a single chip can contain unbounded dynamic content

### 5. Define route mapping under the contract
The implementation must document or encode how each route fits the contract:
- `Explore`
  - standard title + subtitle header, no primary action rail
- `Search`
  - dynamic title from query, optional support count, explicit long-query overflow behavior
- `Favorites`
  - standard title + subtitle, no primary action rail
- `History`
  - standard title, optional subtitle only if already justified by product copy
- `Files`
  - dynamic title from current folder or static page title, primary actions in header, view controls below header
- `Downloads`
  - standard title + subtitle, view controls below header, no ad hoc separate header rhythm from `Files`
- `Settings`
  - may retain support-meta chips if still justified, but must conform to the same header zone contract rather than acting like a separate hero system

### 6. Preserve behavior boundaries
- Do not move route business logic into the shared header.
- Do not change action semantics, button copy intent, or route navigation behavior unless required for consistency and explicitly documented.
- Do not introduce a new global layout manager/store for this task.

### 7. Update durable docs if the contract becomes SSOT
If a reusable contract or new shared component becomes the durable standard, update:
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- relevant Lite handoff sub-docs under `apps/docs/content/docs/apps/lite/handoff/`

Do not put implementation detail into `handoff/index.mdx` unless it is only a map-level pointer.

## Forbidden Patterns
- No route-specific one-off header contracts that recreate current drift under different class names.
- No raw HTML controls in the action rail.
- No arbitrary width hacks introduced solely to force one page to fit.
- No new palette direction, decorative hero treatment, or route branding.
- No moving `ViewControlsBar`-type shared controls into the header row if that reduces readability or breaks the action hierarchy.
- No undocumented text-overflow behavior left to browser defaults.

## Acceptance Criteria
1. All in-scope pages use one documented page shell/header contract or one intentionally shared pattern family with explicit reasons for any allowed variation.
2. Header composition clearly separates title block, optional action rail, and optional support meta.
3. `Files` and `Downloads` share the same shell/header rhythm and the same rule for view controls living below the primary header.
4. `Settings` no longer behaves like an undocumented special-case hero; any retained chips/summary row are described by the shared contract.
5. Long folder names and long search queries do not overflow, overlap actions, or collapse the layout at supported mobile widths.
6. Header action labels remain readable; when width is constrained, layout wraps/stacks instead of clipping text.
7. Stable route titles remain visually stable and do not receive unnecessary truncation.
8. The task does not introduce Phase 2 route-state modeling or Phase 3 overlay/focus behavior.
9. Any new shared component or pattern is justified by repeated usage across the affected routes.
10. Relevant durable docs are updated if and only if the implementation establishes a new long-term contract.

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- Shared shell/header component files added or updated for this task
- `apps/lite/src/routeComponents/ExplorePage.tsx`
- `apps/lite/src/routeComponents/SearchPage.tsx`
- `apps/lite/src/routeComponents/FavoritesPage.tsx`
- `apps/lite/src/routeComponents/HistoryPage.tsx`
- `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- `apps/lite/src/routeComponents/SettingsPage.tsx`
- Any updated docs under `apps/docs/content/docs/apps/lite/ui-patterns/`
- Any updated docs under `apps/docs/content/docs/apps/lite/handoff/`

### Adjacent Critical Files (Spot Check)
- `apps/lite/src/components/Files/FilesPageHeader.tsx`
- `apps/lite/src/components/Files/ViewControlsBar.tsx`
- any shared `EmptyState`, `LoadingPage`, or route-shell wrapper touched while implementing the contract

### Mandatory Regression Anchors
- Long dynamic title rendering for search query and current folder name
- Mobile wrapping behavior when header includes two action buttons
- No regression in `Files` add-audio/new-folder actions
- No regression in `Downloads` density controls
- No regression in `Settings` support-meta chip wrapping and readability

## Required Tests
- Add or update route/component tests that verify:
  - long search query header rendering does not overflow or collapse actions
  - long folder name header rendering follows the documented clamp/truncate policy
  - `Files` and `Downloads` keep view controls below the primary header instead of drifting into ad hoc layouts
  - header action rail stacks or wraps on narrow widths instead of clipping labels
- If class-based assertions are brittle, use stable semantic selectors or component-level assertions that still prove the contract.
- Keep tests focused on shell/header behavior; do not expand into unrelated route business logic.

## Manual Verification
Manually verify at minimum:
1. `Explore`, `Search`, `Favorites`, `History`, `Files`, `Downloads`, and `Settings` all present a consistent top-of-page shell rhythm.
2. A very long search query remains readable and contained on mobile and desktop.
3. A very long folder name remains readable and contained on mobile and desktop.
4. `Files` primary actions remain usable on mobile without clipped labels.
5. `Settings` header chips wrap cleanly and do not push the title into overflow failure.

## Verification Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`
- `pnpm -C apps/lite test:run`

If the repository’s existing test selection strategy requires narrower targeting, document the exact replacement command in `## Completion`.

## Decision Log
- Required if this task changes a durable reusable UI contract, documented shell pattern, or long-term visual/interaction policy.
- Waived only if implementation stays entirely within already-documented contracts and simply converges code to them.

## Bilingual Sync
- Not applicable for the instruction file itself.
- Required for any touched handoff docs that have `.zh.mdx` counterparts.

## Completion
- Completed by:
- Reviewed by:
- Commands:
- Notes:
