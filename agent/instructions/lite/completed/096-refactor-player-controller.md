# Task: 096 - Unify Player Command Logic via usePlayerController [COMPLETED]

## Objective
Consolidate duplicated playback command logic across `GlobalAudioController`, `FullPlayer`, and `MiniPlayer` into a shared controller hook, while preserving existing runtime behavior exactly.

## Product Decision (Fixed)
1. Create one shared hook: `usePlayerController`.
2. `GlobalAudioController` media-session handlers (`prev`/`next`) must use the shared controller commands.
3. `FullPlayer` and `MiniPlayer` skip handlers must use the same shared commands.
4. Keep current smart navigation semantics:
   - if subtitle neighbor exists, jump to neighbor subtitle start
   - otherwise fallback to time skip.
5. Keep skip step constant unified as `SKIP_SECONDS = 10`.
6. Preserve current edge-case guards from existing behavior:
   - no invalid seek beyond bounds
   - duration-unready behavior remains safe and deterministic.
7. Preserve playback rate cycle behavior in FullPlayer (0.8, 1.0, 1.25, 1.5, 2.0).

## Prerequisite
- If Instruction 092 has already migrated FullPlayer interaction shell, `096` must apply on top of that baseline and must not reintroduce removed gesture paths.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - No UI layout redesign; only command handler wiring refactor.
- Tests:
  - Add shared controller tests and update app shell playback interaction tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Controller commands must read latest store state (`usePlayerStore.getState`) to avoid stale closure issues.
- Hot-path performance:
  - Avoid broad store subscriptions; keep atomic selectors in components.
  - Controller should expose stable callbacks to reduce unnecessary rerenders.
- State transition integrity:
  - Play/pause/seek transitions must remain consistent with existing player state machine.
  - Media Session prev/next must remain behaviorally identical.
- Dynamic context consistency:
  - Subtitle-aware navigation must adapt to current subtitle list and current index at call time.

## Implementation Steps (Execute in Order)
1. **Create shared controller hook**
   - Add:
     - `apps/lite/src/hooks/usePlayerController.ts`
   - Export command API (required):
     - `togglePlayPause`
     - `skipBackward`
     - `skipForward`
     - `prevSmart`
     - `nextSmart`
     - `jumpToSubtitle(index: number)`
     - `cyclePlaybackRate`
   - Internal constant:
     - `SKIP_SECONDS = 10`

2. **Implement behavior-preserving command semantics**
   - `skipBackward`:
     - target = `max(0, progress - SKIP_SECONDS)`
   - `skipForward`:
     - target = `min(duration, progress + SKIP_SECONDS)` when duration available
     - safe fallback when duration not ready must match current behavior
   - `prevSmart` / `nextSmart`:
     - use neighbor subtitle when available
     - otherwise fallback to skip command
     - preserve existing bounds/guard semantics currently used in `GlobalAudioController` and `MiniPlayer`.
   - `jumpToSubtitle(index)`:
     - out-of-range or invalid index must be no-op (no throw, no seek).
   - `cyclePlaybackRate`:
     - if current playbackRate is outside configured cycle set, normalize to `1.0` before continuing cycle behavior.

3. **Refactor GlobalAudioController**
   - Update:
     - `apps/lite/src/components/AppShell/GlobalAudioController.tsx`
   - Remove local `TRACK_SKIP_SECONDS`, `handlePrev`, `handleNext`.
   - Use `usePlayerController` commands for media-session actions.
   - Keep all audio event handling and status synchronization logic unchanged.

4. **Refactor FullPlayer**
   - Update:
     - `apps/lite/src/components/AppShell/FullPlayer.tsx`
   - Replace local:
     - `handleSkipBack`
     - `handleSkipForward`
     - `handleJumpToSubtitle`
     - `handlePlaybackRateClick`
   - Wire buttons and Transcript jump callback to controller commands.

5. **Refactor MiniPlayer**
   - Update:
     - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
   - Replace local `handlePrev` / `handleNext` with controller commands.
   - Keep existing mute/volume/UI behavior unchanged.

6. **Docs sync (atomic)**
   - Update handoff docs to describe centralized player command authority via `usePlayerController`.

## Acceptance Criteria
- Hardware media keys (prev/next/play/pause) still work through `GlobalAudioController`.
- FullPlayer and MiniPlayer skip controls behave identically to current behavior.
- Subtitle-aware smart prev/next behavior is consistent across media keys and UI buttons.
- `SKIP_SECONDS` exists in one location only.
- No functional regression in play/pause/seek behavior.

## Required Tests
1. Add `apps/lite/src/hooks/__tests__/usePlayerController.test.ts`
   - `skipBackward` bounds
   - `skipForward` bounds/duration-not-ready behavior
   - `prevSmart` and `nextSmart` subtitle branch and fallback branch
   - `jumpToSubtitle` behavior
   - playback-rate cycling sequence
   - `jumpToSubtitle` out-of-range no-op behavior
   - playback-rate unknown-value normalization (`-> 1.0`) behavior
2. Update existing:
   - `apps/lite/src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
   - assert media-session prev/next still invoke correct seek behavior.
3. Add/update:
   - `apps/lite/src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
   - `apps/lite/src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
   - assert skip button wiring uses shared command semantics.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/usePlayerController.test.ts`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/hooks/usePlayerController.ts` (new)
  - `apps/lite/src/components/AppShell/GlobalAudioController.tsx`
  - `apps/lite/src/components/AppShell/FullPlayer.tsx`
  - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
  - tests under:
    - `apps/lite/src/hooks/__tests__/`
    - `apps/lite/src/components/AppShell/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- Regression risks:
  - semantic drift in prev/next fallback logic
  - stale closure bugs if controller captures outdated state
  - subtle duration edge-case regressions
- Required verification:
  - controller unit tests pass
  - app shell playback tests pass
  - full lite build passes

## Forbidden Dependencies
- Do not add new state or media libraries.
- Do not change player store persistence schema.
- Do not redesign FullPlayer/MiniPlayer UI in this instruction.

## Required Patterns
- Single command authority via `usePlayerController`.
- Read latest player state at execution time for command handlers.
- Maintain Zustand atomic selector usage in components.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite exec vitest run src/hooks/__tests__/usePlayerController.test.ts src/components/AppShell/__tests__/GlobalAudioController.test.tsx src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
