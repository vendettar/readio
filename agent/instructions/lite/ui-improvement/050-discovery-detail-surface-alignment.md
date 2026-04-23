# Task: Discovery Detail Surface Alignment

## Goal
Align Lite discovery detail surfaces so `PodcastShowPage` and `PodcastEpisodeDetailPage` follow the shared discovery/detail contract for hero layout, metadata density, semantic status treatment, and description/read-more behavior without changing discovery product scope or introducing a new visual identity.

## Status
- [ ] Active
- [ ] Completed

## Recommended Order
1. Execute after `010`, `030`, and `040` are stable.
2. If Phase 1 semantic status/badge decisions were documented during `020` or related doc updates, apply that contract here instead of inventing a discovery-only variant.

## Depends On
- `agent/instructions/lite/ui-improvement/001-ui-improvement-roadmap.md`
- `agent/instructions/lite/ui-improvement/010-page-shell-and-header-contract.md`
- `agent/instructions/lite/ui-improvement/030-loading-empty-error-state-standardization.md`
- `agent/instructions/lite/ui-improvement/040-overlay-layering-and-focus-contract.md`

## Can Run In Parallel
- No with broad discovery route cleanup touching the same show/detail files.
- No with overlay/focus work on the same detail surfaces.
- Yes with unrelated library route work outside discovery detail pages.

## Read First (Required)
- `apps/docs/content/docs/index.mdx`
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/general/design-system/index.mdx`
- `apps/docs/content/docs/general/design-system/components.mdx`
- `apps/docs/content/docs/general/design-system/tokens.mdx`
- `apps/docs/content/docs/general/design-system/visuals.mdx`
- `apps/docs/content/docs/general/accessibility.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`
- `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
- `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
- any shared components used by those pages for metadata and description rendering

## Phase Boundary (Strict)
This is a Phase 4 discovery/detail hardening task.

It may:
- align show/detail hero structure with prior shell/header contracts
- align metadata density and grouping
- replace raw semantic color usage with semantic status treatment
- define description/read-more policy on show/detail routes
- tighten detail-page structure where a reusable contract is justified

It may not:
- change discovery/show/detail product behavior
- change episode resolution logic or data sourcing
- introduce a new brand direction or novelty-driven redesign
- absorb unrelated overlay/focus work except where `040` already defines the interaction contract

## Problem
Discovery detail routes currently feel related but not fully governed by one contract:
- show and episode heroes use different metadata rhythm and action anchoring logic
- episode detail still contains raw semantic color classes for status-like treatments
- description presentation differs between show and episode routes, but the rationale is not written as one explicit policy
- loading/error/region-unavailable states use shared ideas but not one documented detail-surface pattern

## Current Contract
- Show page emphasizes podcast identity, show description, subscription, and episode list.
- Episode detail emphasizes immediate access to the full episode description and hero actions.
- Discovery handoff already states:
  - show page uses expandable descriptions
  - episode detail descriptions should be fully displayed
- The implementation still uses route-local hero composition and some raw palette-based status styling.

## Target Contract
Discovery detail routes should follow one documented family contract for:
- hero composition
- artwork/text/action balance
- metadata grouping and density
- semantic status treatment
- description/read-more policy
- continuity of state/region-unavailable presentation

The result should feel like one discovery detail system, not two isolated page designs.

## Alignment Metrics
The alignment outcome must be measurable:
- CTA placement rules (which actions appear in the hero vs below, and in what order)
- metadata grouping order (kicker/caps row vs standard metadata row)
- description placement (above/below fold) and truncation rules
- shared state presentation cues for loading/error/region-unavailable

When a difference is required, document it explicitly and tie it to the product role (show browse vs episode detail).

## Delta
- Convert current route-local hero composition drift into a documented family contract.
- Replace raw color-coded status treatments with semantic tokens or reusable status primitives.
- Make description/read-more policy explicit and durable.

## Scope

### In Scope
- `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
- `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
- shared detail-page helper/primitives used by these routes

### Out of Scope
- `Explore` page top-level route shell
- search page
- library routes
- transcript/player/search overlay systems
- episode resolution / routing business logic
- network caching policy

## Product Decisions (Locked)
1. Show page remains the subscription-and-browse surface.
2. Episode detail remains the maximum-information surface.
3. Episode detail descriptions must continue to expose full content without a collapse-first UX unless the existing handoff docs are intentionally changed.
4. Visual cleanup must preserve the current discovery visual language.

## Scope Scan (8 Scopes)
- Config & env parsing:
  - No config/env change.
- Persistence & data integrity:
  - No schema or persistence change.
- Routing & param validation:
  - No route contract change.
- Logging & error handling:
  - Error-state composition may be aligned visually; logging path does not change.
- Network & caching:
  - No query/cache contract change.
- Storage & serialization:
  - No storage/serialization change.
- UI state & hooks:
  - Local description expansion or hero presentation state may remain.
  - No new global state for detail-page presentation.
- Tests & mocks:
  - Add/update tests for metadata/status/description contract behavior.

## Hidden Risk Sweep
- Async control flow:
  - Show page feed fallback and region-unavailable branches are already nuanced; do not collapse them into oversimplified presentation rules.
- Re-entrancy:
  - Action callbacks (play, subscribe, favorite, download) must remain route-owned and deterministic.
- Hot-path performance:
  - Do not introduce expensive HTML/description reprocessing outside existing memoized components.
- Cache drift:
  - Preserve existing stale-data and fallback behavior; this task is presentation-focused.

## Dynamic Context Consistency
The detail contract must remain resilient under:
- long show titles and episode titles
- long artist/show names
- long descriptions in multiple languages
- missing optional metadata such as season/episode number
- narrow screens and wide desktop layouts

## Required Changes

### 1. Define one discovery detail family contract
Document the shared contract for show/detail routes covering:
- hero block structure
- artwork sizing relationship to text/actions
- metadata grouping order
- action cluster placement
- description block placement

### 2. Align hero structure without erasing route purpose
- Show page may keep a browse-oriented hero.
- Episode detail may keep an action-forward hero.
- But both pages must follow one documented structural family with explicit reasons for any allowed divergence.

### 3. Standardize metadata density and grouping
The contract must define:
- what metadata belongs in caps/kicker rows vs standard metadata rows
- how many metadata concepts may appear before wrap/truncation becomes necessary
- when route-specific metadata deserves a badge/treatment versus plain text

### 4. Replace raw semantic color treatments
- Raw palette classes used for status-like meaning in detail surfaces must be replaced with semantic tokens or a documented reusable status contract.
- This includes episode-type and explicitness treatments where they currently rely on route-local raw color choices.
- Do not invent new color systems; reuse existing semantic-token direction.
- **Any newly converged Semantic Status Badge must be manually verified to pass WCAG text contrast ratios in both Light and Dark mode to prevent invisible text.**

### 5. Define description/read-more policy
The task must explicitly encode:
- show page description behavior:
  - expandable/collapsible where long-form show descriptions benefit from progressive disclosure
- episode detail description behavior:
  - full description displayed by default per current handoff contract
- any shared `ExpandableDescription` configuration rules needed so these differences remain intentional

This task must not collapse show-page and episode-detail description behavior into one global discovery description policy. Their difference is a product decision, not accidental drift.

### 6. Align state and fallback presentation at the detail-surface level
- Loading/error/region-unavailable presentation on show/detail pages should feel like part of one discovery family.
- Do not redefine the full route-state matrix from `030`; only align the detail-surface expression of those states.
- `050` must consume the state taxonomy and precedence already established by `030`.
- `050` may adjust only the detail-surface expression layer:
  - hero/body composition
  - state illustration or messaging layout
  - CTA placement inside the already-defined state branch
- `050` may not:
  - invent discovery-only route-state categories
  - redefine loading/error/offline/partial precedence
  - introduce a new show/detail-specific state matrix that competes with `030`

### 7. Preserve business semantics
- Do not change subscribe/favorite/play/download behaviors.
- Do not change canonical routing, region recovery, or resolution logic.
- Do not move actions to locations that weaken current product visibility guarantees without explicit rationale.

### 8. Update durable docs if the contract changes
If a durable discovery/detail contract emerges, update:
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
- any other design-system doc only if the change is truly reusable beyond discovery detail pages

## Forbidden Patterns
- No discovery redesign brief disguised as cleanup.
- No raw palette status classes left in detail surfaces without explicit approval.
- No changing description semantics by “cleaning up” `ExpandableDescription`.
- No refactoring data/query logic purely for UI convenience.

## Acceptance Criteria
1. `PodcastShowPage` and `PodcastEpisodeDetailPage` follow one explicit discovery-detail family contract.
2. Hero, metadata, and action composition feel aligned while preserving each page’s product role.
3. Raw semantic status color treatments are replaced by semantic or reusable status treatments.
4. Description/read-more behavior is explicit and matches the documented product decision for each page.
5. Loading/error/region-unavailable detail states no longer feel like unrelated page implementations.
6. The task does not alter routing, resolution, caching, or action semantics.

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
- `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
- any shared discovery/detail metadata or description components touched
- updated `ui-patterns` / discovery handoff docs

### Adjacent Critical Files (Spot Check)
- `apps/lite/src/components/ui/expandable-description.tsx`
- any shared interactive artwork/title components touched by detail hero alignment
- discovery-related tests covering country recovery and action behavior

### Mandatory Regression Anchors
- show-page subscribe action placement and usability
- episode-detail play/favorite/download action placement and usability
- full description visibility on episode detail
- region-unavailable recovery CTA continuity

## Required Tests
- Add/update tests that verify:
  - description policy differences between show and episode detail remain intentional
  - semantic status treatment replaces raw palette assumptions
  - detail action clusters remain visible and usable
  - route fallback states continue to render correctly

## Manual Verification
1. Check show and episode detail pages on mobile and desktop.
2. Verify long titles/descriptions do not break hero composition.
3. Verify explicit/trailer/bonus treatments remain understandable after semantic-token alignment.
4. Verify region-unavailable recovery paths still work and look coherent.

## Verification Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`
- `pnpm -C apps/lite test:run`

## Decision Log
- Required if this task changes a durable discovery detail visual/status contract or description policy.

## Bilingual Sync
- Not applicable for the instruction file itself.
- Required for any touched handoff docs with `.zh.mdx` counterparts.

## Completion
- Completed by:
- Reviewed by:
- Commands:
- Notes:
