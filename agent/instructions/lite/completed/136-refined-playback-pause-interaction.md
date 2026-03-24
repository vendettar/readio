---
description: Implement nuanced playback control for transcript interactions
---

# Instruction 136: Refined Playback Pause Interaction [COMPLETED]

Goal: Implement a more nuanced playback pause behavior that correctly distinguishes between navigation (simple clicks) and selection interactions (drags, long-presses) to avoid unnecessary interruptions while ensuring deterministic pause/resume cycles.

## Read First (Required)
- `apps/lite/src/hooks/selection/useSelectionActions.ts`
- `apps/lite/src/hooks/selection/useSelectionEvents.ts`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

## Current Baseline (Strict Controls)
1. **Simple Clicks** (Paragraph jumping/seeking): Playback MUST NOT pause.
2. **Drag Selection**: Playback MUST pause early once the drag threshold (10px) is crossed.
3. **Long Press**: Playback MUST pause early once the time threshold (300ms) is reached, even before the mouse is released.
4. **Context Menu**: Playback MUST pause when the menu opens and resume when closed (if it was playing before).
5. **Lookup**: Playback MUST pause when lookup starts and resume when closed (if it was playing before).

## Interaction Thresholds (Magic Numbers)
- `DRAG_THRESHOLD_PX = 10`: Minimum pointer movement to qualify as a "drag". Prevents shaky clicks from triggering pause.
- `LONG_PRESS_DELAY_MS = 300`: Minimum hold time to qualify as a "long press". Pauses playback early to prepare for context menu.
- `INTERACTION_PAUSE_DELAY_MS = 0`: Micro-task delay for `pause()` calls to ensure they win over any synchronous seek/play events in the same tick.

## Implementation Standards
### 1. Pure State Updaters
- All `setState` updaters in `useSelectionActions` MUST be pure.
- **NEVER** trigger Store updates (e.g., `setHighlightedWord`), global DOM changes (`removeAllRanges`), or Async requests inside a `setState((s) => { ... })` block.
- Doing so causes "Cannot update a component while rendering" errors because React cannot coordinate the secondary component update (e.g., `Word`) during the primary render.

### 2. Interaction State Ref
- Use a stable `wasPlayingBeforeInteractionRef` to track playback state at the *start* of an interaction.
- Use this ref to decide whether to `play()` during `clearSurface`, `closeMenu`, or `cancelInteraction`.

### 3. Early Pause vs. Cleanup Resume
- `prepareInteraction()`: Called on drag detected or long-press delay. Pauses playback.
- `cancelInteraction()`: Called on `mouseup` if no selection was actually made (e.g., a shaky click on background). Resumes playback if it was paused by `prepareInteraction`.
- This ensures that even if a "shaky click" accidentally triggers an early pause, it is immediately corrected on release.

## Verification
- Clicking on different paragraphs for navigation does not interrupt playback.
- Holding a word for 300ms pauses playback.
- Dragging across multiple words pauses playback immediately after 10px of movement.
- Closing a lookup callout or menu resumes playback correctly.

## Bilingual Sync Required
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- Ensure the "Interaction Contract" section reflects the 10px / 300ms thresholds and the early-pause philosophy.
