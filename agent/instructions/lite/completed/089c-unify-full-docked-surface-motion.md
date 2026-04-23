# Task: 089c - Unify Full/Docked Surface Motion (Single-Action Morph, No Dual-Surface Perception) [COMPLETED]

## Precondition (Must)
- `completed/089b-docked-transcript-surface-mode.md` is implemented and review-signed.
- This task is a UX continuity follow-up, not a feature-scope expansion.

## Objective
Eliminate the perceptible two-step transition (`full` closes, then `docked` rises) and replace it with a single continuous morph:
- `full -> docked` must feel like one surface shrinking into docked frame.
- `docked -> full` must feel like the same surface expanding to fullscreen.
- Keep existing capabilities and behavior (transcript interactions, mini restore, route stability) unchanged.

## Product Decision (Fixed)
1. Full and docked are two layout states of one logical reading surface.
2. Transition must be one continuous animation action (single visual motion chain).
3. Do not present full/docked as two independently appearing panels.
4. Existing “reuse current standard reading area” rule from 089b remains mandatory.
5. No new right-side reading region.
6. No route changes during mode transitions.
7. Functional parity must hold:
   - transcript rendering and lookup behavior unchanged,
   - mini collapse/restore unchanged,
   - full-only gestures/controls remain available in full state.
8. 089b guard rules remain mandatory:
   - full-open remains gated by playable context.
   - when playable context is absent, full-open entry stays disabled/no-op.

## Scope Scan (Required)
- Config:
  - No runtime config additions.
- Persistence:
  - No DB or storage key changes.
- Routing:
  - No route additions or navigation side-effects.
- Logging:
  - No new production logging.
- Network:
  - No API changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - Surface presentation architecture changes; mode state model remains `mini | docked | full`.
- Tests:
  - Add/adjust AppShell transition tests to assert single-surface continuity.

## Hidden Risk Sweep (Required)
- Async control flow:
  - mode toggles during rapid user actions must not produce intermediate invalid states.
- Hot-path performance:
  - animation must avoid forced sync layout thrash and unnecessary remounts.
- State transition integrity:
  - no mode “stuck” state if transitions are interrupted.
- Dynamic context consistency:
  - subtitle/zoom/following state must remain consistent across full<->docked morph.

## Implementation Steps (Execute in Order)
1. **Create a single shared surface frame owner**
   - Introduce a unified frame component (e.g. `PlayerSurfaceFrame`) that owns motion container and mode-based layout variants.
   - Mount one frame for reading surface states (`docked` and `full`) instead of separate surface containers.

2. **Unify reading content core**
   - Extract shared transcript-reading core from existing `DockedPlayer` and `FullPlayer` into one reusable content component.
   - Keep only mode-specific chrome in thin wrappers (header controls, fullscreen-only side panel, gestures).

3. **Use one layout animation identity**
   - Apply a single `layoutId`/shared motion identity for the surface frame between `docked` and `full`.
   - Use a shared constant (e.g. `PLAYER_SURFACE_LAYOUT_ID`) to avoid accidental string divergence.
   - Remove sequencing that causes separate exit-enter perception.
   - Ensure `full -> docked` and `docked -> full` are single-chain interpolations.

4. **Refactor AppShell rendering topology**
   - Update `apps/lite/src/components/AppShell/AppShell.tsx` so it does not render docked and full as independent top-level overlays that swap visibly.
   - Keep mini player topology unchanged.

5. **Preserve mode-specific behaviors without dual-surface illusion**
   - Full-specific: body scroll lock, gesture close, fullscreen controls.
   - Docked-specific: compact header with collapse action.
   - These behaviors must be attached to mode state within one frame lifecycle.

6. **Prevent remount-driven flicker/state loss**
   - Keep transcript-related local UI state stable through mode morph whenever possible.
   - Avoid key changes that force full subtree remount on mode switch.
   - Keep a stable frame identity/test hook (e.g. `data-testid="player-surface-frame"`) so continuity is testable.

7. **Documentation sync (atomic)**
   - Update handoff docs to state “single surface, multi-layout states” for full/docked transitions:
     - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Acceptance Criteria
- Transition `full -> docked` is visually one continuous shrink/morph motion.
- Transition `docked -> full` is visually one continuous expand/morph motion.
- No visible “first panel disappears, second panel appears” sequence.
- A single surface frame remains mounted across `docked <-> full` transitions (no dual-frame overlap and no remount swap).
- Mode transitions keep current route unchanged.
- Transcript interactions (lookup/highlight/selection/follow/zoom) continue to work with no regressions.
- Mini collapse/restore behavior remains unchanged.
- Full-open gating behavior from 089b remains unchanged.

## Required Tests
1. Add:
   - `apps/lite/src/components/AppShell/__tests__/AppShell.surface-morph.test.tsx`
   - Assert only one reading-surface frame exists while toggling `docked <-> full`.
   - Assert no simultaneous dual-surface containers are rendered.
   - Assert mode toggles do not alter route.

2. Update:
   - `apps/lite/src/components/AppShell/__tests__/AppShell.player-surface-mode.test.tsx`
   - Align assertions with unified frame topology (no separate docked/full duality assumptions).

3. Update:
   - `apps/lite/src/components/AppShell/__tests__/DockedPlayer.controls.test.tsx`
   - `apps/lite/src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
   - Keep control behavior assertions intact under unified frame architecture.
4. Update:
   - `apps/lite/src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
   - Assert full-open playable-context guard behavior remains unchanged from 089b.

5. Regression guard:
   - Ensure transcript core tests still pass:
     - existing `TranscriptView` and selection flow tests from 089/090 scope.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/AppShell.surface-morph.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/AppShell.player-surface-mode.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/DockedPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/AppShell/AppShell.tsx`
  - `apps/lite/src/components/AppShell/DockedPlayer.tsx`
  - `apps/lite/src/components/AppShell/FullPlayer.tsx`
  - `apps/lite/src/store/playerSurfaceStore.ts` (transition wiring/state continuity checks if touched)
  - new shared surface/content component(s) under `apps/lite/src/components/AppShell/`
  - related AppShell tests
  - docs listed above
- Regression risks:
  - body scroll lock timing regressions in full mode
  - transcript state reset on mode transitions due remount
  - gesture handling conflicts in unified frame
- Required verification:
  - single-surface continuity tests pass
  - no behavior regression in docked/full controls and transcript flow

## Forbidden Dependencies
- Do not add new animation/state libraries.
- Do not change routing architecture.
- Do not introduce new reading regions/panels.
- Do not alter transcript business logic for this task.

## Required Patterns
- One logical surface with mode-based layout variants.
- Shared motion identity across docked/full.
- Deterministic mode transitions driven by existing `playerSurfaceStore`.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update EN/ZH docs listed in step 7.

## Completion
- Completed by: Worker Agent
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/AppShell.surface-morph.test.tsx`
  - `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/AppShell.player-surface-mode.test.tsx`
  - `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/DockedPlayer.controls.test.tsx`
  - `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
  - `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-11
- Reviewed by: Codex (GPT-5)
