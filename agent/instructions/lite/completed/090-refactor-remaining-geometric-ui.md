# Task: 090 - Remove Remaining Geometric Selection Paths (Word-Driven Interaction Only) [COMPLETED]

## Precondition (Must)
- Instruction 089 must be implemented and review-signed before starting 090.
- Do not run 089 and 090 transcript interaction refactors in parallel.

## Objective
Complete the post-089 cleanup by removing remaining geometric word-interaction logic from transcript selection flow:
- Word click and word context menu must be driven by `Word` component events.
- `useSelectionEvents` must handle only native range selection and container-level close behavior.
- Eliminate duplicated interaction paths that can diverge under virtualization.

## Product Decision (Fixed)
1. `Word` component is the only trigger source for single-word lookup and single-word context menu.
2. `useSelectionEvents` no longer performs word hit-testing for lookup (`findWordAtPoint` path removed).
3. `useSelectionEvents` keeps native selected-range context menu support.
4. `SelectionState.hoverWord` and `SelectionState.hoverRects` are removed.
5. `WordHoverOverlay` is removed from transcript interaction path.
6. A dedicated action is added in `useSelectionActions`: `openWordMenu(word, x, y)`.
7. Event target normalization is mandatory before target inspection:
   - Convert `event.target` to `Element` when target is `Text`, then apply selector checks.
8. Zustand selector guard remains mandatory for touched components and hooks.
9. Context-menu priority is fixed:
   - If native selection is non-collapsed, range-selection context menu wins.
   - Word context-menu path must not fire in the same event.

## Scope Scan (Required)
- Config:
  - No new runtime config key.
- Persistence:
  - No schema change.
  - No cache contract change.
- Routing:
  - No route changes.
- Logging:
  - Keep current logging behavior; no new noisy logs.
- Network:
  - No new API.
  - No increase in lookup request count.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - Selection and lookup UI remain deterministic from one state source per TranscriptView.
- Tests:
  - Add/adjust unit and integration tests for dedupe and menu behavior.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Removing fallback lookup must not break click-to-lookup.
  - Word click and word context menu must not dispatch duplicate state transitions.
- Hot-path performance:
  - Remove mousemove geometric calculations to reduce high-frequency work.
  - Keep virtualized transcript scrolling unaffected.
- State transition integrity:
  - Range selection menu, lookup popover, and close behavior must not get stuck.
  - Right click on word and right click on selected range must both produce valid menu state.
- Dynamic context consistency:
  - Word normalization for menu/lookup must match tokenization and highlight logic.

## Implementation Steps (Execute in Order)
1. **Add explicit word-menu action**
   - Update `apps/lite/src/hooks/selection/useSelectionActions.ts`.
   - Add `openWordMenu(word, x, y)` that sets:
     - `showMenu: true`
     - `menuPosition: { x, y }`
     - `selectedText: word`
     - `menuMode: 'word'`
   - Keep `lookupWord`, `copyText`, `searchWeb`, `closeMenu`, `closeLookup` behavior unchanged.

2. **Move word context-menu authority to `Word`**
   - Update `apps/lite/src/components/Transcript/Word.tsx`.
   - Add prop `onContextMenu(word, rect)`.
   - On `contextmenu`:
     - `preventDefault()`
     - `stopPropagation()`
     - call `onContextMenu(cleanWord, getBoundingClientRect())`.
   - Priority guard:
     - if native selection is non-collapsed, skip `onContextMenu` here and let range-selection menu path own the event.

3. **Wire handlers from TranscriptView through SubtitleLine**
   - Update:
     - `apps/lite/src/components/Transcript/TranscriptView.tsx`
     - `apps/lite/src/components/Transcript/SubtitleLine.tsx`
   - Pass shared callbacks from TranscriptView to SubtitleLine and Word:
     - `onWordLookup(word, rect)`
     - `onWordContextMenu(word, rect)`
   - Both callbacks must use the single TranscriptView-owned selection actions/state.

4. **Remove geometric lookup/hover from `useSelectionEvents`**
   - Update `apps/lite/src/hooks/selection/useSelectionEvents.ts`.
   - Remove:
     - `findWordAtPoint` lookup path
     - click-timer single-click lookup fallback
     - mousemove hover tracking for word hit-testing
   - Keep:
     - native range-selection menu path
     - scroll/resize close behavior
     - container-bound event wiring for selection lifecycle

5. **Normalize event target before selector checks**
   - In remaining event handlers that inspect target:
     - If `event.target` is `Text`, map to `parentElement`.
     - Run selector checks on normalized `Element`.
   - Use this for word-token detection and menu routing to avoid nested-node misses.

6. **Clean selection state shape**
   - Update `apps/lite/src/lib/selection/types.ts` and related state init/reset sites.
   - Remove:
     - `hoverWord`
     - `hoverRects`
   - Update all call sites and close handlers to stop reading/writing removed fields.

7. **Remove obsolete overlay usage**
   - Verify `WordHoverOverlay` has no remaining non-transcript usage first.
   - If no remaining usage exists, remove transcript-path usage and dead exports:
     - `WordHoverOverlay` from transcript selection flow
   - Remove `WordHoverOverlay` export and implementation only when verified dead.

8. **Documentation sync (atomic with behavior change)**
   - Update docs to state:
     - word interactions are component-driven
     - geometric fallback lookup path removed
     - range-selection context menu retained

## Acceptance Criteria
- Left-click on a word opens lookup once.
- Right-click on a word opens custom word context menu once.
- Right-click with native selected range opens selected-text context menu.
- No fallback geometric lookup is triggered for word clicks.
- No hover rect state remains in selection state model.
- No runtime errors from removed geometric utilities.

## Required Tests
### 1) Update existing tests
- `apps/lite/src/hooks/selection/__tests__/useSelectionActions.test.ts`
  - cover `openWordMenu` state transition.
  - keep latest-wins and abort semantics for `lookupWord`.

### 2) Add new tests
- `apps/lite/src/hooks/selection/__tests__/useSelectionEvents.no-geometric-lookup.test.ts`
  - assert mouseup no longer calls geometric lookup path.
  - assert selected-range mouseup still opens menu.
  - assert normalized `event.target` handles Text-node target safely.

- `apps/lite/src/components/Transcript/__tests__/TranscriptView.word-interactions.test.tsx`
  - left-click word -> lookup dispatch count `=== 1`.
  - same click must assert fallback lookup dispatch count `=== 0`.
  - right-click word -> menu opens with `menuMode: 'word'` and selected word text.
  - with non-collapsed native selection, right-click must open range menu path only (word menu dispatch count `=== 0`).

- `apps/lite/src/lib/selection/__tests__/selectionState.shape.test.ts`
  - assert state type/init no longer includes `hoverWord` and `hoverRects`.

### 3) Regression guard
- Add assertions that no code path writes removed hover fields after cleanup.
- Add assertion that word and range context-menu paths cannot both dispatch in one event.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionActions.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionEvents.no-geometric-lookup.test.ts`
- `pnpm -C apps/lite test:run -- src/components/Transcript/__tests__/TranscriptView.word-interactions.test.tsx`
- `pnpm -C apps/lite test:run -- src/lib/selection/__tests__/selectionState.shape.test.ts`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/hooks/useSelection.ts`
  - `apps/lite/src/hooks/selection/useSelectionEvents.ts`
  - `apps/lite/src/hooks/selection/useSelectionActions.ts`
  - `apps/lite/src/lib/selection/types.ts`
  - `apps/lite/src/components/Transcript/TranscriptView.tsx`
  - `apps/lite/src/components/Transcript/SubtitleLine.tsx`
  - `apps/lite/src/components/Transcript/Word.tsx`
  - `apps/lite/src/components/Selection/SelectionUI.tsx`
  - `apps/lite/src/components/Selection/index.ts`
  - related tests under `apps/lite/src/**/__tests__/`
  - docs under `apps/docs/content/docs/apps/lite/handoff/features/` and `.../handoff/architecture*`
- Regression risks:
  - context menu behavior drift between word and range flows
  - missed target detection when event target is Text node
  - stale references to removed hover fields
- Required verification:
  - interaction count assertions pass (`lookup === 1`, fallback `=== 0`)
  - selector lint guard passes
  - full lite test suite passes

## Forbidden Dependencies
- Do not add new UI/state libraries.
- Do not reintroduce geometric fallback lookup logic.
- Do not change routing, caching, or persistence behavior in this instruction.

## Required Patterns
- Single-source selection authority per TranscriptView.
- Component-driven word interaction events.
- Event target normalization before selector checks.
- Zustand atomic selectors in touched files.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH docs:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionActions.test.ts`
  - `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionEvents.no-geometric-lookup.test.ts`
  - `pnpm -C apps/lite test:run -- src/components/Transcript/__tests__/TranscriptView.word-interactions.test.tsx`
  - `pnpm -C apps/lite test:run -- src/lib/selection/__tests__/selectionState.shape.test.ts`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-11 18:21 CST
