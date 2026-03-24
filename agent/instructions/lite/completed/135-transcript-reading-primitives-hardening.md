---
description: Replace hand-rolled transcript interaction primitives with stronger Radix/Floating UI building blocks
---

# Instruction 135: Transcript Reading Primitive Hardening

Goal: reduce custom interaction infrastructure in transcript-reading by replacing the highest-risk hand-rolled menu and floating-surface behavior with mature primitives, while preserving shipped product contracts.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/lite/src/components/Selection/SelectionUI.tsx`
- `apps/lite/src/components/Selection/lookupGeometry.ts`
- `apps/lite/src/components/Transcript/TranscriptView.tsx`
- `apps/lite/src/components/Transcript/Word.tsx`
- `apps/lite/src/components/Transcript/SubtitleLine.tsx`
- `apps/lite/src/hooks/selection/useSelectionEvents.ts`
- `apps/lite/src/components/ui/popover.tsx`
- `apps/lite/src/components/ui/dropdown-menu.tsx`

## Current State (Do Not Re-solve)
The recent selection refactor already introduced:
- a discriminated `surface` state model (`none | menu | lookup`)
- unified close-path dispatch for selection surfaces
- pause-on-lookup behavior hardening
- anchored selection UI split between menu and lookup surfaces

Do not reopen these solved contracts unless the primitive migration requires a strictly necessary internal rewrite.
This instruction does require one controlled rewrite of the `surface` variant names so the primitive split is explicit:
- do not keep a catch-all `menu` surface type that mixes right-click context menus with drag-selection action menus
- replace it with explicit surface categories:
  - `contextMenu`
  - `rangeActionMenu`
  - `lookup`
- `ownerKind` remains the source-origin descriptor (`word | line | range`) and must not be used as a substitute for `surface.type`

## Scope Scan Report (8 Required Scopes)
- Config: Low risk. No env/config mutation required.
- Persistence: Low risk. No IndexedDB/local persistence changes required.
- Routing: Low risk. No route contract changes.
- Logging: Low risk. No new logs required.
- Network: Low risk. Dictionary fetch contract stays unchanged.
- Storage: Low risk. No schema or serialization changes.
- UI state: High risk. Transcript menu / lookup / hover-freeze / outside-dismiss contracts must remain stable.
- Tests: High risk. Primitive swaps must be covered by interaction and positioning regressions, not implementation-detail tests.

## Current Baseline (Do Not Rebuild)
The following behaviors are already shipped and must be preserved:
- Transcript word lookup pauses playback exactly once when `pauseOnDictionaryLookup` is enabled.
- Duplicate words only apply selected background to the clicked instance.
- Range/word copy menu uses `copySelected`; line context menu uses `copyLine`.
- Transcript hover freezes while menu/lookup surface is open.
- Outside click/right-click closes the current surface before any new transcript surface opens.
- The first outside pointer interaction closes the active surface and is absorbed; it must not click through to the underlying transcript or page actions.
- Locked hover block follows the active surface source line, not the last hovered line.

## Doc/Code Alignment Note (Must Resolve)
- The current handoff docs still describe lookup placement as top-first / bottom-fallback.
- The current implementation and this instruction use `left -> right -> top -> bottom` as the product-owned preference order.
- This instruction is the canonical direction for the refactor. The bilingual handoff docs must be corrected to match the implemented contract when this work lands.

## Implementation Strategy (Mandatory Order)
Execute in this order. Do not batch all changes into one patch.

1. **Right-Click Menu Primitive Upgrade**
   - Add `@radix-ui/react-context-menu`.
   - Replace hand-rolled keyboard / roving-focus behavior only for the true right-click / long-press surfaces:
     - word context menu
     - line context menu
   - Preserve existing line-vs-word menu branching.
   - Do **not** force drag-selection action UI into `context-menu` semantics.

2. **Selection Action Menu Boundary Clarification**
   - Keep drag-selection action UI as an anchored action surface (popover/menu), not a context-menu primitive.
   - Preserve the existing product contract that selection completion opens actions near the selected range.
   - The drag-selection menu may reuse shared menu item rendering, but must remain semantically distinct from right-click context menus.
   - This distinction must be reflected in state shape, not just rendering branches:
     - right-click / long-press surfaces use `surface.type = 'contextMenu'`
     - drag-selection action surfaces use `surface.type = 'rangeActionMenu'`

3. **Surface Source State Hardening**
   - Stop inferring frozen-hover ownership from DOM geometry when avoidable.
   - Promote source ownership into explicit surface state before the lookup primitive migration depends on it.
   - The existing selection `surface` state remains the single visibility authority for transcript surfaces.
   - Radix / Floating primitives must run in controlled mode from repo-owned selection state; do not introduce primitive-owned parallel open state.
   - The surface model must carry explicit stable owner metadata, not an implied DOM relationship.
   - `surface.type` and `ownerKind` are different axes and must remain distinct:
     - `surface.type` answers which UI primitive is open
     - `ownerKind` answers what transcript source originated that surface
   - Minimum required fields:
     - `ownerCueKey`
     - `ownerCueStartMs`
     - `ownerKind` (`word | line | range`)
     - `ownerTokenInstanceId` when the source is a specific word instance
   - These owner fields are required in transient UI state only; do not persist them to IndexedDB, settings storage, or playback session records.
   - Prefer stable cue metadata over viewport-relative DOM inference or virtualization-relative line index.
   - Use line index only if its stability is explicitly proven across virtualization and transcript lifecycle, and document that proof in the implementation notes / handoff update.
   - Remove DOMRect-to-line reverse lookup once explicit source metadata is in place.

4. **Lookup Surface Primitive Upgrade**
   - Use `@floating-ui/react` as the placement and anchored-interaction engine for the lookup callout.
   - Replace `Dialog + transparent overlay + manual fixed geometry shell` with an anchored floating/callout model.
   - Preserve current placement contract priority: `left -> right -> top -> bottom`.
   - Preserve current outside-dismiss and frozen-transcript behavior.
   - Keep product-owned side preference logic in repo code; delegate collision/shift/anchored layout behavior to Floating UI.
   - Anchor stability must survive virtualization and row reuse:
     - if the physical source node unmounts while the surface is open, the surface must fail over to a stable virtual reference / last-known visual anchor derived from explicit owner metadata
     - owner loss must not crash the surface, jump it to `(0,0)`, or silently transfer ownership to a recycled row
   - Do not use `autoPlacement`.
   - If `flip` fallback behavior is used, it must be explicitly configured to `left -> right -> top -> bottom`.
   - `shift` may keep the surface inside the viewport, but must not reorder the product-owned side preference.
   - The lookup surface must remain non-modal:
     - no focus trap
     - no full-screen blocker/backdrop
     - no modal `Dialog` semantics reused under a different wrapper
   - Outside interaction contract must remain explicit even after removing modal semantics:
     - the first outside `pointerdown` closes the active surface
     - that same interaction is absorbed
     - no click-through to underlying transcript words, lines, links, or page controls
   - Focus behavior must be explicit:
     - keyboard-opened lookup must place focus deterministically inside the callout
     - `Escape` closes only the active surface
     - focus restore should return to the originating transcript affordance when it still exists; otherwise fail soft without throwing

## Required Changes
1. Transcript right-click menus must use a mature Radix context-menu primitive instead of manual focus bookkeeping.
2. Drag-selection action UI must remain an anchored action surface and must not be reclassified as a context-menu primitive.
3. Lookup surface must stop relying on `Dialog` semantics for a non-modal anchored callout.
4. Manual placement math should be reduced to product-specific side preference only; collision handling / anchored layout should move to Floating UI.
5. Surface source ownership must become explicit state, not a best-effort DOM geometry inference.
6. Transcript selection state remains the only open/close authority for menu and lookup surfaces; Radix/Floating visibility must stay controlled from that state.
7. Lookup outside interaction must close the active surface without click-through to the underlying transcript or page.
8. Floating placement configuration must not use automatic side discovery that can violate `left -> right -> top -> bottom`; fallback order must be explicitly configured.
9. The `surface` discriminant must be made explicit and non-overloaded:
   - `contextMenu`
   - `rangeActionMenu`
   - `lookup`
   - do not retain a generic `menu` variant that multiplexes multiple primitive semantics
10. Existing transcript interaction contracts must remain unchanged:
   - drag selection beats word click lookup
   - only clicked duplicate word instance gets selected background
   - frozen hover line follows active surface source
   - first outside interaction closes current surface only
   - word long-press behavior matches desktop right-click menu semantics
11. Long-press behavior must be specified and preserved explicitly:
   - long-press opens the same word context menu contract as desktop right-click
   - crossing the drag threshold before timeout cancels long-press
   - an active native text selection cancels long-press open
   - opening one surface must not immediately reopen another surface in the same gesture cycle
12. The refactor must update the bilingual handoff docs so the canonical placement order and explicit source-ownership model match shipped code.

## Hidden Risk Sweep
- Async control flow: lookup abort/retry must not reopen stale surfaces.
- State transition integrity: menu -> lookup transitions must not lose source-line ownership.
- Primitive state ownership: controlled transcript state and primitive internal state must not drift apart.
- Gesture priority conflicts: long-press, right-click, native selection, left-drag selection, and word click must be mutually deterministic and must not double-open competing surfaces.
- Dynamic context consistency: docked/full transcript layout changes must not skew anchored positioning.
- Hot-path performance: no per-mousemove DOM queries after explicit source ownership is introduced.
- Touch/gesture parity: long-press must not regress into accidental lookup, accidental drag, or double-open behavior.
- Focus semantics: swapping away from `Dialog` must not silently drop keyboard escape, initial focus, or safe focus restore behavior.
- Virtualization lifecycle: frozen-hover ownership must survive source row recycling/unmount while a surface remains open.
- Layering consistency: all transcript surfaces must share a unified portal/z-index strategy so menu, range actions, and lookup never compete unpredictably.

## Preferred Dependencies
- Required:
  - `@radix-ui/react-context-menu`
  - `@floating-ui/react`

## Forbidden Shortcuts
- Do not keep manual roving-focus logic once context-menu primitive is introduced.
- Do not keep `DialogOverlay` as the primary dismissal model for lookup callout.
- Do not introduce new full-screen blockers/backdrops over transcript content.
- Do not preserve DOM-query source-line inference if explicit surface source state is added.
- Do not force drag-selection menu into desktop-style context-menu semantics.
- Do not treat `lineIndex` as a stable owner identity unless that assumption is explicitly proven and documented.
- Do not let primitive-local portal defaults create accidental stacking-order differences between transcript surfaces.
- Do not rely on CSS coupling to incidental primitive attributes without documenting the styling contract in the updated handoff docs / decision log.

## Verification Commands
These are the minimum required checks for instruction completion. Broader suite runs are optional unless scoped checks fail.

- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/Transcript/__tests__/TranscriptView.word-interactions.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Selection/__tests__/SelectionUI.keyboard.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Selection/__tests__/SelectionUI.positioning.test.tsx`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useSelection.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionEvents.dragging.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionEvents.no-geometric-lookup.test.ts`
- Add/target new tests for:
  - word context-menu primitive behavior
  - line context-menu primitive behavior
  - drag-selection action menu behavior
  - explicit `surface.type` split coverage (`contextMenu` vs `rangeActionMenu` vs `lookup`)
  - lookup close/abort path
  - lookup outside pointerdown closes without click-through
  - lookup outside pointerdown absorption remains intact after migrating from `DialogOverlay` dismissal to Floating UI outside-interaction handling
  - frozen-hover source ownership
  - virtualization/unmount does not break source ownership while a surface is open
  - keyboard focus entry/escape/restore for lookup callout
  - long-press cancel on drag-threshold crossing
  - gesture priority matrix coverage (`right-click`, `long-press`, `left-drag`, `native selection`, `word click`)
  - unified layering coverage so lookup, range actions, and context menu render in the intended portal/z-index order
  - docked/full layout switch does not violate preferred placement order

## Acceptance Criteria
1. Transcript right-click menus no longer manage keyboard focus through manual ref arrays.
2. Drag-selection action UI remains anchored to the selected range and is not implemented as a context-menu primitive.
3. Lookup callout no longer depends on `DialogOverlay` to provide anchored non-modal behavior.
4. Side preference remains `left -> right -> top -> bottom`.
5. Hover-freeze, outside-close, duplicate-word, and long-press parity contracts continue to pass.
6. Surface source ownership is explicit stable metadata, not inferred from current hover or DOM reverse lookup.
7. Lookup remains non-modal and preserves explicit keyboard focus behavior (`open`, `Escape`, safe restore).
8. The first outside pointer interaction closes lookup without triggering the underlying transcript or page click target.
9. Right-click / long-press context menus and drag-selection action menus are represented by different `surface.type` variants, not by a single overloaded `menu` branch.
10. Bilingual handoff docs are updated to match the final shipped placement order and source-ownership model.

## Impact Checklist
- Affected modules:
  - transcript selection/menu primitives
  - lookup surface positioning
  - transcript hover-freeze ownership
  - touch/long-press transcript interaction path
  - transcript surface portal/layering strategy
- Regression risks:
  - right-click menu opens with broken focus or wrong items
  - selection action menu is incorrectly converted into context-menu behavior
  - lookup callout drifts or flips against product rules
  - lookup outside-dismiss regresses into click-through behavior
  - primitive-owned open state drifts from transcript surface state
  - physical anchor unmount during virtualization causes lookup jump, crash, or owner drift
  - gesture handlers race and open the wrong surface for long-press / drag / right-click
  - portal layering causes one transcript surface to hide another incorrectly
  - hover-freeze becomes desynchronized from active surface source
  - outside click opens a new surface before closing the old one
  - long-press diverges from desktop right-click semantics
  - keyboard users lose deterministic focus entry/exit behavior after `Dialog` removal
  - virtualization recycles the owner row and breaks frozen-hover continuity
- Required verification:
  - commands above pass
  - manual smoke for word lookup, range selection, word context menu, line context menu, long-press, duplicate-word highlighting, and frozen hover behavior

## Bilingual Sync
- Required: Yes.
- Update:
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

## Decision Log
- Required: Yes.
- Record the durable primitive-standard decision and rationale for:
  - transcript right-click menu semantics
  - anchored lookup primitive choice
  - explicit source-ownership state model
  - virtual-anchor fallback strategy for transcript virtualization
  - why drag-selection action UI remains an anchored action surface instead of context-menu semantics
  - transcript surface portal/z-index contract
