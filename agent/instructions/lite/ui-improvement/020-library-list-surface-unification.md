# Task: Library List Surface Unification

## Goal
Unify the populated list and card surfaces used by `Files`, `Downloads`, `History`, and `Favorites` so Lite library routes share one documented row/list contract for density, metadata rhythm, divider behavior, trailing actions, and subtitle/version affordances without changing route behavior or absorbing loading/empty/error state work.

## Status
- [ ] Active
- [ ] Completed

## Recommended Order
1. Execute after `ui-improvement/010-page-shell-and-header-contract.md`.
2. Execute after `ui-improvement/030-loading-empty-error-state-standardization.md` has defined state presentation rules.

## Depends On
- `agent/instructions/lite/ui-improvement/001-ui-improvement-roadmap.md`
- `agent/instructions/lite/ui-improvement/010-page-shell-and-header-contract.md`
- `agent/instructions/lite/ui-improvement/030-loading-empty-error-state-standardization.md`

## Can Run In Parallel
- No with `010` or `030` on the same route files.
- No with any separate list-row cleanup touching the same library surfaces.
- Yes with unrelated discovery-detail or overlay work outside these list surfaces.

## Read First (Required)
- `apps/docs/content/docs/index.mdx`
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/general/design-system/index.mdx`
- `apps/docs/content/docs/general/design-system/components.mdx`
- `apps/docs/content/docs/general/design-system/tokens.mdx`
- `apps/docs/content/docs/general/accessibility.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
- relevant files under `apps/lite/src/components/EpisodeRow/`
- relevant files under `apps/lite/src/components/Files/`
- relevant files under `apps/lite/src/components/Downloads/`

## Phase Boundary (Strict)
This is a Phase 1 populated-surface task.

It may:
- standardize row and card density
- standardize list spacing, divider rhythm, and metadata rows
- standardize action-rail placement and visibility on populated surfaces
- standardize subtitle/version summary presentation where it belongs to the row/card contract
- extract durable shared row/list patterns where repeated use justifies it

It may not:
- redefine route headers or page shells from `010`
- redefine loading / empty / error / partial-data models from `030`
- redefine overlay/focus/portal semantics from `040`
- change playback, routing, subtitle activation, deletion semantics, or download/file business logic

## Problem
Library routes already share some primitives, but populated surfaces still diverge in ways users can feel:
- `History` and `Favorites` use `EpisodeListItem`, while `Files` and `Downloads` use separate card/list systems
- divider coverage, hover emphasis, metadata row density, and action-rail spacing vary by route
- `Downloads` and `Files` have overlapping but not identical track-card semantics
- subtitle/version affordances are lighter in `Downloads` and richer in `Files`, but the boundary between “shared list contract” and “route-specific detail” is undocumented

## Current Contract
- `History` and `Favorites` already share a reusable episode-row primitive.
- `Files` has its own density-aware folder and track list sections.
- `Downloads` reuses parts of the Files visual language but still has route-specific grouping and subtitle summary presentation.
- Hover/action visibility rules are documented only at a high level in `ui-patterns/features.mdx`, not as a route-cluster contract.

## Target Contract
All populated library surfaces should follow one explicit contract for:
- density variants
- row/card padding and vertical rhythm
- divider treatment
- primary metadata row and secondary metadata row composition
- trailing action rail placement
- hover/focus treatment
- subtitle/version summary presentation level

The contract may still allow more detailed file-management UI on `Files`, but differences must be intentional and documented.

## Delta
- Reduce visual and structural drift across populated library surfaces.
- Clarify which differences are route-specific and which are accidental.
- Extract or codify only the durable shared patterns, not one-off page conveniences.

## Divergence Exception Policy
If a divergence must remain:
- record the justification, owning route, and a review-by date
- ensure the divergence is tied to a product job difference, not legacy implementation
- document the exact component/selector scope it applies to so it cannot silently expand

## Scope

### In Scope
- `apps/lite/src/routeComponents/FavoritesPage.tsx`
- `apps/lite/src/routeComponents/HistoryPage.tsx`
- `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- shared populated-surface components they depend on

### Out of Scope
- page header/shell structure
- loading/empty/error/partial/offline states
- search result rows
- discovery carousels/grids
- transcript/player/search overlays
- persistence or repository logic

## Product Decisions (Locked)
1. `Files` remains the richer local-file management surface.
2. `Downloads` remains the lighter downloaded-episode management surface.
3. The goal is a shared family contract, not forced identical UIs.
4. Any divergence must be justified by task differences, not legacy drift.

## Scope Scan (8 Scopes)
- Config & env parsing:
  - No config or env change.
- Persistence & data integrity:
  - No storage key/schema change.
- Routing & param validation:
  - No route contract change.
- Logging & error handling:
  - No new logging contract.
- Network & caching:
  - No network/cache policy change.
- Storage & serialization:
  - No storage/serialization change.
- UI state & hooks:
  - Density/view state may be reused but not redefined.
  - Shared presentation props are allowed; business logic stays route-owned.
- Tests & mocks:
  - Add/update component and route tests for populated-surface contract behavior.

## Hidden Risk Sweep
- Async control flow:
  - Do not pull async data loading into shared row components.
- Re-entrancy:
  - Trailing action menus and play/favorite handlers must remain route-owned callbacks.
- Hot-path performance:
  - Avoid broad store subscriptions in item rows.
  - Preserve atomic selector usage and existing memoization boundaries.
- Cache drift:
  - None expected.

## Dynamic Context Consistency
The list contract must remain resilient under:
- long titles/subtitles
- translated metadata labels
- compact and comfortable density
- mixed presence/absence of artwork, subtitle badges, favorite state, and action menus
- keyboard focus visibility
- narrow mobile widths

## Required Changes

### 1. Define one library populated-surface contract
Create or document a shared contract covering:
- density variants
- row/card padding and gap rhythm
- divider logic between adjacent items
- primary text block hierarchy
- secondary/bottom metadata row behavior
- trailing action rail placement
- hover and focus treatment

Before broad implementation, produce a reviewable divergence table that separates:
- shared base contract
- justified `Files`-only divergence
- justified `Downloads`-only divergence
- default baseline inherited by `History` / `Favorites`
- forbidden divergence that must be removed

This table must exist in a reviewable artifact during implementation:
- either as a dedicated section added to this instruction while active, or
- in the relevant Lite handoff/UI-pattern doc if that doc becomes the durable SSOT

### 2. Standardize density semantics
- `comfortable` and `compact` must mean the same thing across `Files` and `Downloads`.
- If `History`/`Favorites` do not expose a density toggle, they must still align with one documented default density baseline.
- Do not create route-only density names or magic spacing mappings.

### 3. Standardize metadata rhythm
The contract must explicitly state:
- what belongs on the primary text row vs secondary/bottom metadata row
- maximum metadata density before truncation or wrap is required
- whether metadata rows wrap or truncate on narrow widths
- when bottom metadata may use smaller text tokens consistently

### 4. Standardize action rail rules
- Play/favorite/menu rails must have a documented placement model.
- Hover-only visibility changes must not hide controls from keyboard users.
- Action clusters must preserve touch target minimums and not collapse text/content readability.
- Menus must keep current business actions; this task only standardizes placement and surface rhythm.

### 5. Standardize divider and hover contract
- Dividers should follow one documented rule for library lists.
- If hovered/active rows visually cover or suppress dividers, the same principle should apply consistently where the same row model is used.
- Focus-visible states must remain obvious even when hover layers are subtle.

### 6. Clarify Files vs Downloads subtitle/version contract
- `Files` may keep richer subtitle/version management inline if required by the product.
- `Downloads` may keep summary-first treatment.
- The instruction must document the shared base contract and the justified divergence:
  - shared base: placement, density, summary area rhythm
  - justified divergence: detailed management only where the route needs it
- Do not accept “route-specific for now” as a justification.
- Every retained divergence must map back to a different product job, not legacy implementation drift.

### 7. Update durable docs if contract changes
If a durable list-surface contract emerges, update:
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- relevant handoff sub-docs for `files-management` and `history`

## Acceptance Criteria
1. A written divergence table exists and is attached to this instruction or a SSOT doc.
2. All in-scope routes use the same documented density semantics (`comfortable`, `compact`).
3. Row/card metadata rhythm is consistent and matches the documented contract.
4. Action rail placement and hover/focus rules are consistent and keyboard-safe.
5. Any remaining divergence is documented with justification and review-by date.

## Forbidden Patterns
- No route-state cleanup folded into this task.
- No header/shell redesign folded into this task.
- No new playback/routing semantics.
- No replacing stable reusable primitives with route-local copies.
- No list/card extraction justified by only one route.
- **No hardcoded Hex/RGB colors (e.g., `#F3F4F6`) for hover or active row states; strictly use semantic tokens (e.g., `hover:bg-muted`) to ensure Dark Mode compatibility.**

Boundary rule:
- This task applies to populated surfaces only.
- If a route branch is loading, empty, error, partial-data, or offline-degraded, it belongs to `030-loading-empty-error-state-standardization.md` even when the same route file is touched here.
- Do not “clean up state branches while already touching the file” as part of list-surface convergence.

## Acceptance Criteria
1. `Files`, `Downloads`, `History`, and `Favorites` have one explicit populated-surface contract.
2. Density, divider rhythm, metadata rows, and trailing action rails are consistent where the surfaces serve the same job.
3. `Files` and `Downloads` read as part of the same family without erasing route-specific subtitle/version needs.
4. `History` and `Favorites` remain aligned with the shared list contract and do not drift as an unrelated row family.
5. Keyboard and touch access to row actions remains intact.
6. The task does not redefine headers, route states, or overlay semantics.

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- any updated `EpisodeRow` shared components
- any updated `Files` list/card components
- any updated `Downloads` row/card components
- `apps/lite/src/routeComponents/FavoritesPage.tsx`
- `apps/lite/src/routeComponents/HistoryPage.tsx`
- `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- any updated docs in Lite `ui-patterns` / handoff files

### Adjacent Critical Files (Spot Check)
- `apps/lite/src/components/ui/overflow-menu.tsx`
- subtitle/version manager components in Files/Downloads
- any density helper shared between Files and Downloads

### Mandatory Regression Anchors
- `History` and `Favorites` row action alignment
- `Files` compact/comfortable density behavior
- `Downloads` subtitle summary badge placement
- row hover/focus states with keyboard navigation

## Required Tests
- Add/update tests that verify:
  - populated row/card density mappings are consistent
  - action rails remain accessible and visible under keyboard focus
  - `Files` and `Downloads` preserve documented subtitle/version divergence while sharing base rhythm
  - divider/hover behavior stays consistent for shared row models

## Manual Verification
1. Check populated `History`, `Favorites`, `Files`, and `Downloads` pages on mobile and desktop.
2. Verify compact/comfortable density in `Files` and `Downloads`.
3. Verify row actions remain easy to target and visually aligned.
4. Verify long metadata strings do not break card structure.

## Verification Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`
- `pnpm -C apps/lite test:run`

## Decision Log
- Required if this task changes a durable row/list visual contract or justified surface divergence policy.
- Otherwise waived.

## Bilingual Sync
- Not applicable for the instruction file itself.
- Required for any touched handoff docs with `.zh.mdx` counterparts.

## Completion
- Completed by:
- Reviewed by:
- Commands:
- Notes:
