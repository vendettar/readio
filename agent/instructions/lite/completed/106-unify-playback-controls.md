# Task: 106 [COMPLETED] - Unify Playback Speed Control and Transport Button Primitives

## Objective
Eliminate playback-control divergence between `MiniPlayer` and `FullPlayer` by introducing shared control primitives and making MiniPlayer playback speed functional, while preserving existing playback behavior.

## Product Decision (Fixed)
1. Add shared control primitives under `apps/lite/src/components/Player/controls/`:
   - `PlaybackSpeedButton.tsx`
   - `TransportPlayPauseButton.tsx`
   - `TransportSkipButton.tsx`
2. Keep existing playback logic ownership in page/shell components:
   - callbacks stay in `MiniPlayer` and `FullPlayer`.
   - shared components are presentational + callback-driven.
3. Make MiniPlayer speed button functional using the same rate set already used by FullPlayer:
   - `[0.8, 1.0, 1.25, 1.5, 2.0]`
4. Keep `GlobalAudioController` playback-rate sync behavior unchanged (already implemented).
5. Preserve current skip semantics:
   - `FullPlayer`: strict ±10s seek.
   - `MiniPlayer`: subtitle-jump fallback + ±10s fallback.
6. Preserve current visual style and layout tokens in both players.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - Keep `playbackRate` local storage key behavior unchanged.
- Routing:
  - No route changes.
- Logging:
  - No logging changes.
- Network:
  - No network changes.
- Storage:
  - No IndexedDB changes.
- UI state:
  - Playback control refactor only.
- Tests:
  - Add control-component tests and integration checks for both players.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Playback rate updates must remain synchronous state updates and not race with audio source changes.
- Hot-path performance:
  - Avoid broad store subscriptions in extracted components.
- State transition integrity:
  - Play/pause button must still reflect `loading/playing/paused` correctly.
- Dynamic context consistency:
  - aria labels and visible rate labels must update with i18n and store state.

## Implementation Steps (Execute in Order)
1. **Create shared playback speed button**
   - Add:
     - `apps/lite/src/components/Player/controls/PlaybackSpeedButton.tsx`
   - Required props:
     - `playbackRate: number`
     - `onCycleRate: () => void`
     - `disabled?: boolean`
     - `ariaLabel: string`
     - `className?: string`
   - Required behavior:
     - render current rate text (e.g., `1x`, `1.25x`).
     - no internal store access; callback-driven only.

2. **Create shared transport button primitives**
   - Add:
     - `apps/lite/src/components/Player/controls/TransportPlayPauseButton.tsx`
     - `apps/lite/src/components/Player/controls/TransportSkipButton.tsx`
   - Required behavior:
     - preserve existing icon sizes and aria labels.
     - preserve loading spinner rendering for play/pause.

3. **Refactor MiniPlayer controls to shared primitives**
   - Update:
     - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
   - Required behavior:
     - replace static `1×` with functional `PlaybackSpeedButton`.
     - keep existing skip callbacks and play/pause callback behavior unchanged.

4. **Refactor FullPlayer control footer to shared primitives**
   - Update:
     - `apps/lite/src/components/AppShell/FullPlayer.tsx`
   - Required behavior:
     - replace inline speed/play/pause/skip button markup with shared primitives.
     - keep current callback logic and current rate cycle behavior unchanged.

5. **Docs sync (atomic)**
   - Update player architecture docs to record shared playback-control primitives and MiniPlayer speed parity.

## Acceptance Criteria
- MiniPlayer playback speed button cycles rate and immediately affects playback.
- FullPlayer and MiniPlayer display consistent speed labels from shared primitive.
- No regression in play/pause loading state rendering.
- No regression in skip behavior in either player.
- `GlobalAudioController` continues to sync playback rate to audio element.

## Required Tests
1. Add:
   - `apps/lite/src/components/Player/controls/__tests__/PlaybackSpeedButton.test.tsx`
   - Assert rendered label and click callback behavior.
2. Add:
   - `apps/lite/src/components/Player/controls/__tests__/TransportPlayPauseButton.test.tsx`
   - Assert loading/playing/paused icon state and aria label behavior.
3. Add:
   - `apps/lite/src/components/Player/controls/__tests__/TransportSkipButton.test.tsx`
   - Assert click dispatch and aria-label rendering.
4. Add:
   - `apps/lite/src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
   - Assert rate cycle and callback wiring.
5. Update:
   - `apps/lite/src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
   - Assert playback rate updates still propagate to audio element.
6. Add:
   - `apps/lite/src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
   - Assert shared speed/play-pause/skip controls keep existing callback wiring and rate-cycle behavior.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/Player/controls/__tests__/PlaybackSpeedButton.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Player/controls/__tests__/TransportPlayPauseButton.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Player/controls/__tests__/TransportSkipButton.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/Player/controls/PlaybackSpeedButton.tsx` (new)
  - `apps/lite/src/components/Player/controls/TransportPlayPauseButton.tsx` (new)
  - `apps/lite/src/components/Player/controls/TransportSkipButton.tsx` (new)
  - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
  - `apps/lite/src/components/AppShell/FullPlayer.tsx`
  - `apps/lite/src/components/AppShell/GlobalAudioController.tsx` (test verification target)
  - tests under:
    - `apps/lite/src/components/Player/controls/__tests__/`
    - `apps/lite/src/components/AppShell/__tests__/`
    - `apps/lite/src/components/AppShell/__tests__/FullPlayer.controls.test.tsx` (new)
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
- Regression risks:
  - control button behavior drift during extraction
  - aria label mismatch after componentization
  - speed cycle mismatch between players
- Required verification:
  - control primitive tests pass
  - audio controller tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new player/UI libraries.
- Do not change playback state model or store schema.
- Do not redesign player layouts.

## Required Patterns
- Shared control primitives are callback-driven and store-agnostic.
- Player shells retain behavior logic ownership.
- Keep Zustand atomic selectors in shell components.

## Decision Log
- Required: No (behavior-preserving control extraction + MiniPlayer parity fix).

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion

- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec vitest run src/components/Player/controls/__tests__/PlaybackSpeedButton.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Player/controls/__tests__/TransportPlayPauseButton.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Player/controls/__tests__/TransportSkipButton.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
