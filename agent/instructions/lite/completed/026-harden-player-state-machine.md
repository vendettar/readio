> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Harden Player State Machine [COMPLETED]

## Objective
The current player logic is scattered. We need to strictly define the player states to handle transitions reliably, preventing race conditions like "playing while loading".

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Define States (`apps/lite/src/store/playerStore.ts`)
- **Action**: Define a strict union type for `PlayerStatus`.
  ```ts
  type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
  ```
- **Store**: Update `usePlayerStore` to include `status: PlayerStatus`.

## 2. Refactor Actions
- **Action**: Rewrite `play`, `pause`, `load` actions to respect the state machine.
- **Logic**:
  - `play()`: Only valid if status is `paused` or `idle` (with track). Sets status to `playing`.
  - `load()`: Sets status to `loading`. If error occurs, sets `error`.
  - **Constraint**: Do NOT introduce XState or external state libraries. Keep logic inside the Zustand store.

## 3. Handle Edge Cases
- **Scenario**: User clicks Play while another track is loading.
- **Handling**: The new `load()` call should override the previous one (last-write-wins).
- **Scenario**: Browser blocks autoplay.
- **Handling**: Catch the promise rejection in `GlobalAudioController`, dispatch `PAUSE` action, and show `t('player.autoplayBlocked')` ("Playback blocked. Click play to resume.").

## 4. Verification
- **Test**: Click Play rapidly on different tracks. The player should eventually play the last clicked track.
- **Test**: Simulate a load error. UI should show Error state.
- **Test**: Rapidly toggle Play/Pause on the same track and across two tracks (5–10 clicks within 2s). Ensure no stuck `loading` state.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Status**: Completed
- **Date**: 2026-01-26
- **Completed by**: Antigravity

## Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`

## Reviewed by
- Antigravity
