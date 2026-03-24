---
description: Refactor transcript word interaction so native drag selection always wins over click lookup, with execution split into atomic child instructions
---

# Instruction 138: Transcript Click-vs-Drag Intent Refactor

Goal: restore text-like drag-selection freedom inside transcript lines while preserving word lookup, word context menu, cue jump, and documented selection-surface behavior.

## Status
- [ ] Active
- [ ] Completed

## Problem

The current transcript interaction model still treats word tokens as direct interactive controls. This creates a structural conflict:

- users expect to start native text selection from any visible word
- lookup currently depends on direct word-target activation
- native drag selection depends on `pointerdown` landing on text, not an interactive control

This makes the system fragile even when full-line overlay hit targets are removed. The remaining issue is architectural: if a word token itself owns the pointer interaction as a control, native drag-selection can still lose priority when the drag begins on the token.

Current code reality that `138a` must explicitly resolve:

- `apps/lite/src/components/Transcript/Word.tsx` still owns pointerdown/click/context-menu behavior locally.
- `apps/lite/src/hooks/selection/useSelectionEvents.ts` already contains a pointer-state machine for drag/selection semantics.
- `138a` must collapse this split authority into one deferred-intent model where click-vs-drag is decided after release, not partly in the word token and partly in the global selection hook.

## Required Product Outcome

For transcript words:

1. **Single click / press-release without drag** triggers lookup for lookup-eligible words only.
2. **Press, hold, and drag** starts native browser text selection from the exact word under the pointer.
3. **Right click / long press** still opens the word context menu.
4. **Range selection** still routes into the existing selection surface flow.
5. **Cue jump** still works for non-word line clicks and keyboard line activation.
6. **Non-lookup-eligible words** remain text-selectable and must not gain a parallel lookup-eligibility rule.

### Platform Guarantee Boundary

This instruction must guarantee the click-vs-drag contract for desktop-class pointer input first:

- mouse
- trackpad / precision pointer

Touch and long-press behavior must not regress, but this instruction must not over-claim full native-selection parity across all mobile browsers unless a targeted child task proves it with browser-specific regression coverage.

If touch behavior needs a distinct contract or browser-specific fallback policy, split it into a follow-up instead of inflating `138a`.

## Read First (Required)

- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/lite/src/components/Transcript/TranscriptView.tsx`
- `apps/lite/src/components/Transcript/SubtitleLine.tsx`
- `apps/lite/src/components/Transcript/Word.tsx`
- `apps/lite/src/hooks/useSelection.ts`
- `apps/lite/src/hooks/selection/useSelectionEvents.ts`
- `apps/lite/src/hooks/selection/useSelectionActions.ts`
- `apps/lite/src/lib/selection/domUtils.ts`
- `apps/lite/src/components/Transcript/__tests__/TranscriptView.word-interactions.test.tsx`
- `apps/lite/src/components/Transcript/__tests__/SubtitleLine.i18n-tokenization.test.tsx`

## Scope Scan (Architecture-Level)

1. Config & env parsing
   - No config changes expected.
2. Persistence & data integrity
   - No storage/schema change expected.
3. Routing & param validation
   - No route contract change expected.
4. Logging & error handling
   - No new logging path required.
5. Network & caching
   - Lookup request timing must not regress or duplicate.
6. Storage & serialization
   - No persistence change expected.
7. UI state & hooks
   - High risk: transcript words, cue line hit targets, and selection hooks all participate in intent resolution.
8. Tests & mocks
   - Regression coverage is mandatory for click-vs-drag timing and non-regression of context menu / cue jump.

## Hidden Risk Sweep

- **Native selection priority**: no control may intercept `pointerdown` in a way that blocks browser range creation from word text.
- **State transition integrity**: a drag attempt must not accidentally fire lookup or cue jump on release.
- **Hot path performance**: do not introduce per-word expensive listeners that create render or pointer-move overhead.
- **Accessibility**: removing direct button semantics from word tokens must not silently delete keyboard support; replacement semantics must be explicit.

## Design Rule

This refactor must follow one interaction principle:

- `pointerdown` records intent only
- `pointermove` decides whether drag threshold / selection intent was crossed
- `pointerup` resolves the final action:
  - click lookup if no drag / no native selection
  - native selection if drag / selection exists

No implementation is allowed to decide “lookup” at `pointerdown` time for transcript words.

## Implementation Mode (Strict)

This instruction MUST NOT be implemented in one pass if doing so would exceed the project file-scope rule.

Execution must be split into atomic child instructions:

- `138a-transcript-word-intent-model`
- `138b-transcript-doc-sync`

If additional follow-up is required for accessibility or keyboard semantics, add:

- `138c-transcript-keyboard-followup`

Do not bundle child scopes together just because they touch the same feature family.

### 138c Trigger Rule

`138c-transcript-keyboard-followup` becomes required, not optional, if `138a` changes or removes current word-token keyboard lookup/context behavior in any way.

`138a` must not silently reduce keyboard reachability. It must either:

- preserve explicit keyboard support for word lookup/context behavior, or
- stop and open `138c` with exact delta, rationale, and required regression coverage

## Target Architecture

### Word Interaction Model

- Word tokens must stop behaving like direct pointer-owning controls during `pointerdown`.
- Lookup should be resolved from click intent after release, not from raw press.
- Native selection must remain browser-owned.
- Word tokens must not keep `button` / direct-control semantics as the primary pointer host if that host continues to own `pointerdown` for click lookup.
- Any remaining word-level wrapper must behave like text-first content with deferred intent resolution, not like a button patched with drag guards.

### Cue Jump Model

- Cue jump remains available for non-word line clicks.
- Line-level jump must not reclaim pointer interaction that belongs to a drag selection session.

### Menu Visibility Model

- Lookup visibility and lookup affordance must continue to reuse shared `isLookupEligible()` SSOT.
- This instruction does not authorize introducing a second stopword or token-eligibility rule.

## Child Instruction Requirements

### 138a — Transcript Word Intent Model

Must cover only code + regression tests for:

- drag selection can start directly from a word token
- click release without drag still triggers lookup
- right-click / long-press still opens word context menu
- non-word line click still triggers cue jump
- stopword behavior remains aligned with `isLookupEligible()`

Expected file families:

- transcript components
- selection hook / event code only if required
- narrow transcript interaction tests

Execution order inside `138a` is mandatory:

1. write failing regression tests that reproduce word-origin click-vs-drag conflicts
2. implement the intent-model refactor until those tests pass
3. only then perform cleanup/refinement needed for the final maintainable shape

It must not include docs sync.

Desktop mouse/trackpad intent resolution is the required guarantee in `138a`.
Touch long-press / mobile-browser parity may only be changed if the child task explicitly documents the scope and adds targeted coverage for the affected browser/input path.

Keyboard contract must be made explicit in `138a`, not left implicit:

- `Enter` / `Space` on the currently keyboard-reachable transcript word path must either:
  - preserve existing lookup behavior, or
  - be explicitly deferred to `138c` with a written delta and rationale
- line keyboard activation for cue jump must remain
- any keyboard path for context menu / lookup that changes must be called out explicitly in the child task result

If `Word.tsx` remains a `button` or other direct control host after `138a`, the child task must prove with targeted regression coverage that native word-origin drag selection still wins. Otherwise, replace that topology with a text-first host and document the keyboard contract explicitly.

### 138b — Transcript Doc Sync

Must update only the relevant handoff docs:

- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

Docs must state:

- click-vs-drag intent is resolved on release, not press
- native drag selection has priority over lookup when drag/selection intent exists
- lookup eligibility still reuses shared `isLookupEligible()`

## Acceptance Criteria

The refactor is complete only when all of the following are true:

1. Users can begin selection from directly on top of a word token.
2. A simple click on a word still opens lookup.
3. Drag-selection does not accidentally fire lookup on release.
4. Cue jump still works for line clicks outside word-intent handling.
5. Word context menu behavior still works.
6. Stopword affordance/menu suppression remains intact.
7. Docs match the final interaction contract.

## Required Regression Coverage

Child execution must prove:

1. word-origin drag can establish native selection intent
2. word-origin click without drag still dispatches lookup
3. right-click word still opens word context menu
4. line-body click still triggers cue jump
5. stopword lookup suppression remains unchanged

The first set of regression tests in `138a` must fail against the pre-refactor implementation before the implementation change begins.

## Forbidden Approaches

- Do not keep `pointerdown` lookup ownership on a word control and attempt to “patch around” drag with more guards.
- Do not retain the current word-token-as-button topology as the primary pointer host for lookup and claim the problem is solved.
- Do not introduce parallel lookup eligibility logic in transcript components.
- Do not claim native drag freedom unless a targeted regression test proves the blocking topology is gone.
- Do not silently remove keyboard support without an explicit approved follow-up plan.

## Decision Log

- Waived for this parent split instruction.
- If child execution changes durable interaction standards beyond transcript handoff wording, log a decision in the child task.

## Bilingual Sync

- Required at the child doc-sync stage.

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- `apps/lite/src/components/Transcript/Word.tsx`
- `apps/lite/src/components/Transcript/SubtitleLine.tsx`
- `apps/lite/src/hooks/selection/useSelectionEvents.ts`
- transcript interaction tests touched by `138a`

### Adjacent Critical Files (Spot Check)
- `apps/lite/src/hooks/useSelection.ts`
- `apps/lite/src/hooks/selection/useSelectionActions.ts`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
