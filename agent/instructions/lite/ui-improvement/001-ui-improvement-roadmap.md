# Task: Lite UI Improvement Roadmap

## Objective
Create a decision-ready UI improvement roadmap for `apps/lite` that aligns with the current design system, accessibility rules, UI patterns, and existing implementation constraints. This document is a planning artifact for follow-up UI tasks, not a direct implementation instruction.

## Decision Log
- **Required / Waived**: Required if a follow-up task changes a durable reusable UI pattern, interaction contract, or visual language.

## Bilingual Sync
- **Required / Not applicable**: Not applicable. This roadmap lives under `agent/instructions/` and follows the existing English instruction style.

## Non-Goals
This roadmap does **not** authorize a new visual direction for Lite. It is a convergence and hardening plan, not a redesign brief.

Out of scope unless a follow-up task explicitly approves it:
- new branding, palette direction, typography reset, or layout identity shift
- product behavior changes disguised as UI cleanup
- architecture rewrites outside what is required by a documented UI contract
- speculative component extraction without repeated usage evidence
- replacing stable high-risk interaction code solely for cosmetic uniformity
- regressions in transcript selection, overlay dismissal, focus/keyboard behavior, or playback gating semantics

## Audit Scope
This roadmap covers:
- route-level page shells and headers
- row/list/card density and action layout
- loading / empty / error / partial-data state presentation
- semantic status treatments
- overlay / focus / layering contracts
- primitive compliance and token-usage drift

This roadmap does not replace:
- architecture instructions
- persistence / caching strategy docs
- transcript or player product decisions already recorded elsewhere

## Inputs / Source Docs
Read and align with the following existing docs before executing any follow-up task:
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
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/forms.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/settings.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/theming.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`

## Audit Reproducibility
The static audit counts in this roadmap must remain reproducible. When this file is updated, record the command set and counting rules used to derive the reported totals.

At minimum, future roadmap updates should preserve:
- audit command(s)
- excluded paths
- category definition for:
  - raw palette-token usage
  - arbitrary sizing/layering/token escape usage
  - raw interaction primitive exception

### Audit Commands
The current static counts must be reproducible with explicit commands and stable exclusion rules. Future roadmap edits must update this section if the counting method changes.

Recommended command structure:
- raw palette-token usage:
  - `rg -n "bg-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)|text-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)|border-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)" apps/lite/src --glob '!**/__tests__/**' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/dist/**' --glob '!**/coverage/**'`
- hardcoded hex/rgb color usage:
  - `rg -n "(#[0-9a-fA-F]{3,8}|rgba?\()" apps/lite/src --glob '!**/__tests__/**' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/dist/**' --glob '!**/coverage/**'`
- arbitrary sizing/layering/token escape usage:
  - `rg -n "\\[[^\\]]+\\]" apps/lite/src --glob '!**/__tests__/**' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/dist/**' --glob '!**/coverage/**'`
- raw interaction primitive exception:
  - `rg -n "@radix-ui/react-|DropdownMenuPrimitive|PopoverPrimitive|DialogPrimitive|ContextMenuPrimitive" apps/lite/src --glob '!**/__tests__/**' --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/dist/**' --glob '!**/coverage/**' --glob '!apps/lite/src/components/ui/**'`

Minimum exclusion rules:
- exclude generated files, snapshots, and build artifacts
- exclude test-only files when reporting production drift counts unless the roadmap explicitly audits test surfaces
- if a command is narrowed with additional allow/deny patterns, document that narrowing here

Count normalization rule:
- Raw `rg` output is the first-pass inventory, not the final reported total.
- Final reported counts must apply the same documented post-filtering rules each time:
  - remove usages already allowed by current docs or handoff exceptions
  - remove duplicate matches that belong to one logical fix in one surface
  - record any manual narrowing required to reach the published count
- If the published count changes, update both the command output basis and the normalization rationale in the same edit.

Category definition rules:
- `raw palette-token usage` means direct palette classes instead of semantic token classes
- `arbitrary sizing/layering/token escape usage` means arbitrary Tailwind values or one-off token escapes that are not already documented reusable patterns
- `raw interaction primitive exception` means feature/route/app-surface code using underlying primitive APIs directly instead of approved project wrappers or documented surface-local exceptions
- `raw interaction primitive exception` excludes approved primitive wrapper files under `apps/lite/src/components/ui/**`

## Current UI Findings

### Analysis Stage
- **Target UI**: Lite shell, library routes, discovery routes, transcript/player/search overlays, and reusable row/card/page-shell components.
- **Existing Pattern**: The codebase already has a strong design-system baseline built on semantic tokens, shadcn/Radix primitives, shared interaction components, and route-specific handoff rules.
- **Problem**: The main issue is not missing UI patterns, but uneven adoption. Some surfaces are fully aligned with the documented system, while others still use one-off spacing, raw palette classes, ad hoc loading states, or custom interaction shells.
- **Recommended Pattern**: Use a phased hardening plan focused on system consistency, state-heavy route convergence, and high-risk interaction surfaces before introducing any new visual directions.

### Static Audit Evidence
- `27` remaining raw palette-token usages in `apps/lite/src`.
- `31` remaining arbitrary sizing/layering/token escape usages in `apps/lite/src`.
- `2` remaining raw interaction primitive exceptions in app UI code.
- State-heavy routes still mix `LoadingPage`, route-level skeletons, and custom empty/error handling rather than following one predictable state model.
- Discovery detail surfaces still contain raw semantic color treatments and hero-specific presentation logic that drift from the semantic-token policy.
- `TrackCardSubtitles` still contains a raw interactive control despite the project’s primitive-first policy.
- Overlay behavior is documented as standardized, but player/search/selection surfaces still rely on surface-local layering and geometry decisions that should be governed as one interaction system.

### Concrete Hotspots
- `apps/lite/src/routeComponents/ExplorePage.tsx`
- `apps/lite/src/routeComponents/SearchPage.tsx`
- `apps/lite/src/routeComponents/FavoritesPage.tsx`
- `apps/lite/src/routeComponents/HistoryPage.tsx`
- `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- `apps/lite/src/routeComponents/SettingsPage.tsx`
- `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
- `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
- `apps/lite/src/components/AppShell/Sidebar.tsx`
- `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
- `apps/lite/src/components/AppShell/PlayerSurfaceFrame.tsx`
- `apps/lite/src/components/Selection/SelectionUI.tsx`
- `apps/lite/src/components/Files/TrackCardSubtitles.tsx`

## Design Stage

### Components to Reuse
- `Button`
- `Input`
- `Slider`
- `Tooltip`
- `Popover`
- `DropdownMenu`
- `AlertDialog`
- `EmptyState`
- `Skeleton`
- `LoadingSpinner` / `LoadingPage`
- `OverflowMenu`
- `InteractiveArtwork`
- `InteractiveTitle`
- `ActionToggle`
- `ExpandableDescription`
- `ViewControlsBar`
- `SettingsSectionCard`
- `EpisodeListItem`
- `PodcastGrid`

### New Pattern Needed
- **YES**, but only as reusable governance patterns, not as a redesign:
  - unified page-header/page-shell contract
  - unified row/list surface contract
  - unified loading/empty/error state contract
  - unified status/badge contract
  - unified overlay/focus/layering contract for high-risk surfaces

### Interaction Contract
- **Dismiss / focus / keyboard / layering**
  - All future overlay work must explicitly define outside click behavior: dismiss only, dismiss and absorb, or pass through.
  - Search, transcript selection, and player overlays must document initial focus, escape behavior, restore target, portal boundary, and z-index token usage.
  - State-heavy pages must define loading, empty, error, disabled, and partial-data behavior before style adjustments.
  - Discovery and library routes must preserve current product interaction semantics; this roadmap is about system convergence, not behavior churn.

## Prioritization Logic
Follow-up UI work derived from this roadmap should be prioritized in this order:

1. Product-risk and interaction-risk surfaces
2. Reusable system contracts with wide blast radius
3. State-heavy route convergence
4. Visual/token cleanup with low behavior risk
5. Nice-to-have polish

Priority must not be based on visual annoyance alone. A small-looking issue in transcript/player/search overlays outranks broad cosmetic cleanup if it affects interaction correctness, accessibility, focus handling, or layering semantics.

## Exit Criteria and Evidence (Required)
Every follow-up instruction derived from this roadmap must include two explicit sections:
- `Exit Criteria`: measurable conditions for completion (e.g., specific surfaces aligned, explicit contract documented, tests added/updated).
- `Evidence`: artifacts that prove completion (e.g., before/after screenshots, updated contract sections, test names/paths, or diff summary).

For this roadmap itself, it is complete only when:
- the audit counts are reproducible with documented commands and normalization rules
- each Phase 1–4 task includes explicit contract goals and boundary rules
- follow-up instructions reference SSOT docs and list in-scope/out-of-scope files

Evidence for this roadmap must include:
- the audit command set and exclusion rules recorded in this file
- the list of current hotspots and route targets

## Phase 1 — System Consistency
Goal: eliminate design-system drift and converge on reusable UI contracts.

In scope:
- page-header/page-shell contract
- row/list surface contract
- semantic status/badge contract
- remaining primitive-policy exceptions
- durable token/pattern extraction for repeated arbitrary layout usage

Out of scope:
- player/transcript/search overlay architecture
- major route-specific redesign
- discovery hero/detail-surface restyling beyond token compliance

1. Define a single page-header contract for `Explore`, `Search`, `History`, `Favorites`, `Files`, `Downloads`, and `Settings`. Include strict Text Overflow policies (e.g., `truncate` vs `line-clamp-2` vs wrapping).
2. Define a single list-surface contract for row-based pages covering divider behavior, metadata density, hover actions, trailing action rails, and skeleton parity.
3. Define a reusable semantic status/badge contract to replace raw warning/info/status color treatments in discovery and settings surfaces.
4. Replace remaining raw interactive UI controls with project primitives where behavior allows, keeping hidden file inputs as the only routine exception. Ensure all interactive primitives enforce accessible Touch Target Sizes (minimum 44x44px for mobile) and proper ARIA states.
5. Audit remaining arbitrary layout/layering classes and convert only the durable ones into documented reusable tokens or patterns.
6. Update `design-system` / `ui-patterns` docs when a durable reusable contract changes.
7. Add a decision-log entry if any reusable interaction or visual contract is intentionally changed.

Deliverables:
- documented page-header/page-shell contract
- documented row/list surface contract
- documented semantic status treatment contract
- atomic follow-up instructions for repeated primitive/token drift where direct cleanup is still needed

Acceptance standard:
- no new visual direction is introduced
- repeated route-level shell/list drift is reduced through shared contracts
- any new token or reusable pattern is justified by repeated usage, not a single-page convenience

Phase boundary rule:
- Phase 1 defines reusable shell/list/status contracts only.
- It must not absorb route-state modeling from Phase 2 or overlay/focus semantics from Phase 3.

## Phase 2 — State-Heavy Library Surfaces
Goal: make the library experience feel like one product, not several independently evolved pages.

In scope:
- unify route-level loading / empty / error / partial-data presentation
- align skeleton behavior and density
- align empty/error state composition
- define when to use `LoadingPage` vs route-local skeleton vs inline loading state
- tighten shared visual contract across `Files`, `Downloads`, `History`, and `Favorites`

Out of scope:
- route data-flow rewrites unless required to support the documented state contract
- changing fetch timing or product semantics for loading order
- redesigning route identity beyond shared system convergence

1. Unify `Files`, `Downloads`, `History`, and `Favorites` around the same route-shell behavior for loading, empty, partial, and populated states.
2. Replace generic full-page loading spinners on list pages with structured skeletons that preserve final layout geometry.
3. Bring `Files` and `Downloads` into a tighter shared visual contract beyond density controls:
   - header rhythm
   - secondary rows
   - metadata width handling
   - trailing action cluster behavior
4. Standardize destructive and secondary actions across row menus and subtitle/version managers.
5. Normalize offline and network-degraded messaging between `Explore`, `Search`, and library routes.
6. Preserve existing behavior contracts for playback, routing, subtitle activation, and download management.

Deliverables:
- a documented state presentation matrix
- route-cluster follow-up instructions where needed
- explicit verification checklist for each state type

Acceptance standard:
- each affected route has predictable state presentation rules
- no route uses ad hoc loading/empty/error handling without a documented reason

Phase boundary rule:
- Phase 2 owns loading / empty / error / partial-data presentation only.
- It must not redefine page-shell/header contracts from Phase 1 or overlay semantics from Phase 3.

## Phase 3 — High-Risk Reading and Discovery Surfaces
Goal: harden the most interaction-sensitive UI systems without redesigning them.

In scope:
- outside-click contract
- dismiss-and-absorb vs pass-through rules
- initial focus and restore-focus rules
- portal boundary and z-index token policy
- modal vs non-modal contract documentation
- narrow-width/mobile behavior for overlays and reading surfaces

Out of scope:
- changing transcript/player feature scope
- redesigning these surfaces unless needed to restore design-system parity
- speculative visual restyling that does not improve interaction correctness

1. Treat `Sidebar`, `CommandPalette`, player surface, transcript selection UI, and discovery detail heroes as one cross-surface interaction system.
2. Standardize overlay semantics for search, transcript lookup, context menus, and player surfaces:
   - outside interaction policy
   - focus entry/restore
   - keyboard close behavior
   - portal boundary
   - z-index token usage
   - mobile and narrow-width behavior
3. Align discovery show/detail interaction-adjacent surfaces with the shared interaction contract:
   - focus flow where discovery/detail surfaces open or dismiss interactive layers
   - dismiss behavior where overlays or callouts coexist with discovery/detail content
   - portal/layer continuity where interactive surfaces overlap detail-page chrome
   - skeleton/error continuity only where it affects interaction-adjacent surfaces
4. Keep the current visual language. No gratuitous redesign, no novelty-driven restyling.

Deliverables:
- unified overlay / focus / layering contract doc
- explicit mapping of existing surfaces to that contract
- atomic follow-up instructions for the surfaces that still diverge

Acceptance standard:
- overlay semantics are explicit, not implicit
- focus/layering behavior is reviewable and testable
- no high-risk surface relies on undocumented local geometry/layering conventions

Phase boundary rule:
- Phase 3 must diff existing interaction contracts before changing implementation.
- It must not re-open already stabilized player/transcript/search decisions unless the task documents the exact remaining divergence first.

## Phase 4 — Discovery and Detail Surface Hardening
Goal: converge discovery/detail route presentation with semantic token policy and shared shell/list rules once the reusable contracts are stable.

In scope:
- detail layout consistency
- metadata density and title/description treatment
- semantic token compliance
- status treatment consistency
- hero/detail presentation cleanup only where it aligns with current docs or documented follow-up decisions

Out of scope:
- changing discovery/detail product behavior
- introducing a new visual identity

Recommended follow-up targets:
- `PodcastShowPage`
- `PodcastEpisodeDetailPage`
- discovery/detail hero blocks and metadata presentation

Deliverables:
- detail-surface follow-up instructions
- any required `ui-patterns/` additions for reusable detail-page structure

Acceptance standard:
- detail surfaces no longer depend on raw semantic color treatments or one-off hero logic without documented rationale

## Follow-up Instruction Breakdown
Do not implement this roadmap as one large task. Split it into smaller instructions:

1. `ui-improvement/010-page-shell-and-header-contract.md`
   - Target: page headers, route shells, top actions, meta pills, narrow-width behavior.
2. `ui-improvement/020-library-list-surface-unification.md`
   - Target: Files, Downloads, History, Favorites row/list consistency.
3. `ui-improvement/030-loading-empty-error-state-standardization.md`
   - Target: route-state models across Explore, Search, and library routes.
4. `ui-improvement/040-overlay-layering-and-focus-contract.md`
   - Target: Sidebar search, transcript surfaces, player overlay/focus/layering behavior.
5. `ui-improvement/050-discovery-detail-surface-alignment.md`
   - Target: podcast show/detail hero, metadata, status styling, description/read-more policy.

### Recommended Execution Order
Recommended dependency order for follow-up work:
1. `010-page-shell-and-header-contract.md`
2. `030-loading-empty-error-state-standardization.md`
3. `020-library-list-surface-unification.md`
4. `040-overlay-layering-and-focus-contract.md`
5. `050-discovery-detail-surface-alignment.md`

Dependency rationale:
- `010` defines shared shell/header rhythm before route clusters converge on it
- `030` defines the state model before populated-state surfaces are normalized in `020`
- `040` should execute after shell/state contracts are stable because overlay work is high-risk and should not be combined with broad shell cleanup
- `050` depends on prior shell/state/token decisions so discovery/detail cleanup does not invent a parallel contract

Execution rule:
- A child instruction must not absorb work from an earlier unmet dependency unless it is strictly documentation-only and explicitly marked as such.

Every follow-up task created from this roadmap must:
- be atomic and reviewable in one pass
- list exact target components/routes
- state whether it changes reusable pattern docs
- preserve business logic and existing interaction semantics unless explicitly stated
- include browser verification steps
- include lint/typecheck/test commands
- state whether Decision Log is required or waived
- state whether Bilingual Sync is required or not applicable

Each follow-up instruction must:
- re-read task-relevant docs first
- stay within a limited file count and focused surface area

Boundary rule for `010/020/030`:
- `010` covers page shells, headers, top actions, route title/meta rhythm, and narrow-width shell behavior only.
- `020` covers populated list/card/row surfaces only: density, divider rhythm, metadata rows, action rails, and subtitle/version list presentation.
- `030` covers loading / empty / error / partial / offline state handling only.
- No child instruction may redefine another child instruction’s contract area as “cleanup while already touching the file.”

Do not create one large “UI cleanup” instruction covering multiple phases.

## Docs To Update
Follow-up tasks derived from this roadmap may need to update:
- `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/forms.mdx`
- `apps/docs/content/docs/general/design-system/components.mdx`
- `apps/docs/content/docs/general/design-system/tokens.mdx`
- `apps/docs/content/docs/general/accessibility.mdx`
- relevant Lite handoff feature docs when route behavior or expectations are clarified

## Verification
- Confirm all referenced docs and target files still exist before creating child instructions.
- Re-check the relevant docs before editing any design-system or UI-pattern document.
- Before closing any child task, verify:
  - keyboard navigation
  - focus visibility
  - RTL/logical property impact
  - string expansion resilience
  - mobile/narrow-width layout behavior
  - empty/loading/error/partial-data coverage
- Required implementation verification for future child tasks:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - targeted `pnpm -C apps/lite test:run -- <targeted tests>`
  - `pnpm -C apps/lite test:run`
- Required browser checks for future child tasks:
  - sidebar + command palette keyboard flow
  - files/downloads/history/favorites loading and populated states
  - explore/search offline and no-result flows
  - podcast show/detail pages on narrow and wide screens
  - transcript selection / lookup / close / resume continuity
  - player docked/full transitions and focus restoration

## Output of This Roadmap
This document should lead to:
- a prioritized follow-up instruction list
- no direct implementation
- no implicit approval to redesign Lite
- a shared vocabulary for future UI cleanup work

## Done When
- [ ] A clear UI roadmap exists under `agent/instructions/lite/ui-improvement/`.
- [ ] The roadmap is grounded in current code and current docs, not generic design advice.
- [ ] The roadmap identifies concrete current-state drift with evidence.
- [ ] The roadmap splits follow-up work into small, independently executable instructions.
- [ ] The roadmap preserves Readio’s documented design language and interaction rules.

## Notes
- This roadmap is intentionally not a redesign brief.
- The primary objective is consistency, reuse, accessibility rigor, and interaction hardening.
- Follow-up tasks must avoid touching more than a small, coherent surface area at once.
- If a future task changes a durable UI contract, it must update the relevant docs and decision log.
- If future audit counts are updated, they must remain reproducible from explicit command/rule definitions.

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-03-15
- **Reviewed by**:
