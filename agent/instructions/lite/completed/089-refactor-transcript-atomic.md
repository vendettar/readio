# Task: 089 - Transcript Atomic Refactor Hardening (Single Lookup Authority + Span-Safe Highlight) [COMPLETED]

## Objective
Keep the atomic `Word`-based transcript direction and remove integration regressions introduced during refactor:
- Eliminate duplicate lookup requests from the same user click.
- Keep dictionary and highlight behavior consistent under atomic word spans.
- Preserve virtualization performance and existing read-along UX.

## Product Decision (Fixed)
1. Atomic transcript rendering stays: `SubtitleLine` tokenization + `Word` interactive tokens is the required architecture.
2. Selection/lookup state has one authority per TranscriptView: `useSelection(...)`.
3. `SubtitleLine` and `Word` must not create independent selection state instances.
4. Word-click lookup must execute exactly once per click.
5. Generic mouseup lookup path must skip explicit word-token clicks.
6. Lookup-highlight behavior for cached dictionary words remains enabled and must work with nested span DOM.
7. `react-virtuoso` remains the transcript list engine.
8. Unused transcript interaction state must be removed after refactor completion.

## Scope Scan (Required)
- Config:
  - No new runtime config key in this task.
- Persistence:
  - No schema changes.
  - Existing dictionary cache persistence remains unchanged.
- Routing:
  - No route changes.
- Logging:
  - Keep current debug logging policy.
- Network:
  - No new API.
  - Do not increase dictionary request volume.
- Storage:
  - No localStorage/IndexedDB contract change.
- UI state:
  - Context menu, lookup popover, and highlight state remain deterministic and single-sourced.
- Tests:
  - Add integration coverage for lookup dedupe and highlight behavior under spanized transcript DOM.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Avoid dual lookup triggers (`Word` click + container mouseup fallback) for one click.
  - Keep request cancellation and latest-wins semantics unchanged.
- Hot-path performance:
  - No heavy per-frame DOM scans.
  - Highlight refresh must stay bounded to rendered virtual range.
- State transition integrity:
  - Selecting text, clicking word, and clicking line seek cannot leave menu/lookup in inconsistent states.
  - Background click clear behavior must not break active lookup flow.
- Dynamic context consistency:
  - Highlight matching must remain case-insensitive and punctuation-normalized across rendered transcript chunks.

## Implementation Steps (Execute in Order)
1. **Enforce single lookup authority in transcript path**
   - Keep `useSelection(containerRef)` as the only selection/lookup state owner in:
     - `apps/lite/src/components/Transcript/TranscriptView.tsx`
   - Remove local `useSelectionState` / `useSelectionActions` instantiation from:
     - `apps/lite/src/components/Transcript/SubtitleLine.tsx`
   - Pass a single lookup callback from `TranscriptView` down to `SubtitleLine` and `Word`.

2. **Dedupe word click versus generic mouseup lookup**
   - Add explicit marker on word tokens:
     - `data-lookup-word="true"` on `Word` root span.
   - In `useSelectionEvents` mouseup fallback path, skip lookup when event target is inside marked word token.
   - DOM target normalization is required:
     - if `event.target` is a `Text` node, resolve to `event.target.parentElement` first;
     - then run marker check via `closest('[data-lookup-word="true"]')`.
   - Keep right-click context menu and text selection paths unchanged.

3. **Retain atomic word highlight behavior**
   - Keep `transcriptStore.highlightedWord` as the source for current clicked-word highlight.
   - Ensure token normalization rules are consistent across:
     - `Word` comparison
     - lookup action input
     - text token utility

4. **Make highlight manager span-safe**
   - Update `highlightWordInSubtitles` in:
     - `apps/lite/src/lib/highlightManager.ts`
   - Replace `element.firstChild` text-node assumption with deterministic traversal of all text nodes under each `.subtitle-text` container.
   - Preserve regex boundary behavior and existing `Highlight` API integration.

5. **Clean dead transcript interaction state**
   - Remove unused `isLookupActive` state and action from:
     - `apps/lite/src/store/transcriptStore.ts`
   - Keep store minimal: only active state actually consumed by transcript UI.

6. **Verify no regression in selection overlay exports**
   - Keep existing selection UI exports stable:
     - `ContextMenu`
     - `LookupPopover`
     - `WordHoverOverlay` (leave as-is if still referenced elsewhere)
   - Do not perform unrelated UI refactors in this instruction.

7. **Documentation sync (atomic with architecture change)**
   - Update transcript architecture notes to reflect:
     - single lookup authority
     - word-token marker dedupe rule
     - span-safe highlight traversal requirement

## Acceptance Criteria
- Clicking an interactive word triggers one lookup request and one popover update.
- No duplicate lookup from the same click event.
- Dictionary cached-word highlighting still works after transcript spanization.
- Current-word highlight across rendered occurrences stays functional.
- Text selection and context menu actions remain functional.
- Subtitle line click-to-seek behavior remains functional when no text selection exists.
- Transcript scroll/follow behavior remains unchanged.

## Required Tests
### 1) Update existing tests
- `apps/lite/src/hooks/selection/__tests__/useSelectionActions.test.ts`
  - keep latest-wins and abort semantics intact after callback path cleanup.
- `apps/lite/src/lib/text.test.ts`
  - keep tokenizer and interactive-word rules consistent with `Word` normalization.

### 2) Add new tests
- `apps/lite/src/hooks/selection/__tests__/useSelectionEvents.lookup-dedupe.test.ts`
  - click on `data-lookup-word` target does not trigger fallback mouseup lookup.
  - assert fallback lookup callback call count is exactly `0` for marked-word clicks.
  - click on non-word subtitle text still triggers fallback lookup path.
  - text-selection mouseup path still opens context menu and bypasses fallback lookup.

- `apps/lite/src/lib/__tests__/highlightManager.test.ts`
  - highlights matches when `.subtitle-text` contains nested span nodes.
  - case-insensitive matching works across multiple text nodes.
  - punctuation boundaries do not over-match.

- `apps/lite/src/components/Transcript/__tests__/TranscriptView.lookup-flow.test.tsx`
  - word click opens lookup through shared TranscriptView selection state.
  - assert lookup callback call count is exactly `1` for one word click (no duplicate invocations).

### 3) Regression guard
- If `transcriptStore` API changes, update any dependent tests to assert removed dead fields are not used.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionActions.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/text.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionEvents.lookup-dedupe.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/highlightManager.test.ts`
- `pnpm -C apps/lite test:run -- src/components/Transcript/__tests__/TranscriptView.lookup-flow.test.tsx`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/Transcript/TranscriptView.tsx`
  - `apps/lite/src/components/Transcript/SubtitleLine.tsx`
  - `apps/lite/src/components/Transcript/Word.tsx`
  - `apps/lite/src/hooks/useSelection.ts`
  - `apps/lite/src/hooks/selection/useSelectionEvents.ts`
  - `apps/lite/src/lib/highlightManager.ts`
  - `apps/lite/src/store/transcriptStore.ts`
  - related tests under `apps/lite/src/**/__tests__/`
  - docs under `apps/docs/content/docs/apps/lite/handoff/features/` and `.../handoff/architecture*`
- Regression risks:
  - interaction race between click/selection paths
  - highlight mismatch due to token normalization drift
  - virtualized range updates not refreshing highlights
- Required verification:
  - lookup dedupe tests pass
  - highlight manager nested-span tests pass
  - full lite test suite remains green

## Forbidden Dependencies
- Do not add new state libraries.
- Do not replace `react-virtuoso`.
- Do not reintroduce coordinate-only overlay-based lookup as primary flow.
- Do not add network retries outside existing selection API behavior.

## Required Patterns
- Zustand atomic selector usage in touched UI.
- Single-source selection state per transcript view.
- Deterministic DOM traversal for highlights.
- No duplicate event-path side effects for the same user action.

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
  - `pnpm -C apps/lite test:run src/hooks/selection/__tests__/useSelectionActions.test.ts`
  - `pnpm -C apps/lite test:run src/lib/text.test.ts`
  - `pnpm -C apps/lite test:run src/hooks/selection/__tests__/useSelectionEvents.lookup-dedupe.test.ts`
  - `pnpm -C apps/lite test:run src/lib/__tests__/highlightManager.test.ts`
  - `pnpm -C apps/lite test:run src/components/Transcript/__tests__/TranscriptView.lookup-flow.test.tsx`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-10
