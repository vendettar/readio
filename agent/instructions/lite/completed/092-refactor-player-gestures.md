> **Status Update (2026-02-11)**: Drawer-shell strategy in this instruction is superseded by `agent/instructions/lite/092b-replace-drawer-with-motion-shell.md` for player surface architecture.

# Task: 092 - Replace FullPlayer Custom Gesture with Standard Drawer [COMPLETED]

## Precondition (Must)
- Instructions 089 and 090 must be implemented and review-signed before starting 092.
- Do not run 092 in parallel with transcript interaction refactors.

## Objective
Replace FullPlayer custom drag-dismiss logic with the existing standardized Drawer primitive, while preserving immersion behavior and transcript usability.

## Product Decision (Fixed)
1. Use the existing wrapper in `apps/lite/src/components/ui/drawer.tsx` as the only Drawer API.
2. FullPlayer open/close source of truth is `useImmersionStore.isImmersed`.
3. Keep AppShell mount strategy unchanged (`{isImmersed && <FullPlayer />}`).
4. Remove custom gesture hook and manual `y` drag state from FullPlayer.
5. Preserve FullPlayer content structure and existing controls; only interaction shell changes.
6. Keep transcript scrolling usable; transcript vertical scroll must not accidentally dismiss immersion during normal reading scroll.
7. Keep Minimize button close behavior (`exitImmersion`) unchanged.
8. Overlay click closes immersion through Drawer close path.
9. Dismiss gesture scope is fixed: drag-to-dismiss is handle-only; transcript/content area drag must not dismiss.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No DB/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No logging behavior changes.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - FullPlayer dismissal interaction migrates from custom gesture to Drawer interaction.
- Tests:
  - Add component interaction tests for open/close and transcript-scroll safety.

## Hidden Risk Sweep (Required)
- Async control flow:
  - No new async data flow introduced.
- Hot-path performance:
  - Remove per-pointer custom gesture state updates from FullPlayer root.
  - Keep transcript render and follow behavior unaffected.
- State transition integrity:
  - Drawer `onOpenChange(false)` must always map to `exitImmersion()`.
  - Closing FullPlayer must not leave UI in partially blocked states.
- Dynamic context consistency:
  - Desktop/mobile layouts and existing artwork `layoutId` transitions must remain valid.

## Implementation Steps (Execute in Order)
1. **Refactor FullPlayer interaction shell**
   - Update:
     - `apps/lite/src/components/AppShell/FullPlayer.tsx`
   - Remove:
     - `usePlayerGestures` import and usage
     - root-level gesture event bindings (`onPointerDown`/`onPointerMove`/...)
     - root-level `y`-driven motion translation for dismiss behavior
   - Wrap FullPlayer container with Drawer components from `components/ui/drawer`:
     - `Drawer` root with `open={true}` when mounted
     - set `handleOnly={true}` on Drawer root to restrict drag-dismiss to Drawer handle region
     - `onOpenChange` closing path calls `exitImmersion()` when `open` becomes `false`
     - `DrawerContent` hosts existing FullPlayer UI

2. **Preserve transcript scroll usability**
   - Keep transcript container behavior unchanged (`data-scroll-guard="transcript"` path remains in transcript components).
   - Ensure drawer close gesture does not preempt normal transcript vertical scrolling.
   - Enforce deterministic guard via Drawer handle-only dismiss (no content-area drag-dismiss path).

3. **Keep existing close affordances**
   - Minimize button continues to call `exitImmersion()`.
   - Background/overlay close path is routed through Drawer close handling.

4. **Remove obsolete custom gesture module**
   - Delete:
     - `apps/lite/src/hooks/usePlayerGestures.ts`
   - Remove all references to deleted hook.

5. **Dependency and docs cleanup**
   - Remove `@use-gesture/react` from:
     - `apps/lite/package.json`
   - Safety check before dependency removal:
     - verify no remaining runtime imports via `rg -n "@use-gesture/react" apps/lite/src`
   - Update docs that currently claim FullPlayer swipe is implemented with `@use-gesture/react`.

## Acceptance Criteria
- Enter immersion still shows FullPlayer correctly.
- Swipe/drag close behavior is provided by Drawer interaction shell.
- Minimize button closes immersion.
- Overlay click closes immersion.
- Transcript can be scrolled/read without accidental close during normal vertical reading interaction.
- No references to `usePlayerGestures` remain.

## Required Tests
### 1) Automated tests
1. Add `apps/lite/src/components/AppShell/__tests__/FullPlayer.drawer.test.tsx`
   - renders FullPlayer when immersed.
   - `onOpenChange(false)` path calls `exitImmersion`.
   - Minimize button triggers close.
   - overlay/background close triggers close.
2. Update affected tests if imports/hooks changed:
   - keep existing FullPlayer and AppShell behavior assertions intact.

### 2) Manual interaction checks
1. Transcript scroll safety:
   - pointer/scroll interaction inside transcript region does not immediately close immersion.
2. Touch/drag dismiss scope:
   - dragging from Drawer handle dismisses.
   - dragging inside transcript/content region does not dismiss.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `rg -n "@use-gesture/react" apps/lite/src`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/FullPlayer.drawer.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/AppShell/FullPlayer.tsx`
  - `apps/lite/src/components/ui/drawer.tsx`
  - `apps/lite/src/components/AppShell/__tests__/FullPlayer.drawer.test.tsx` (new)
  - `apps/lite/src/hooks/usePlayerGestures.ts` (deleted)
  - `apps/lite/package.json` (dependency cleanup if unused)
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- Regression risks:
  - transcript area drag conflict with drawer dismiss gesture
  - focus/scroll-lock behavior drift on close
  - mismatch between docs and implementation for interaction stack
- Required verification:
  - close-path tests pass
  - transcript scroll safety test passes
  - full lite build passes

## Forbidden Dependencies
- Do not add new gesture libraries.
- Do not introduce a second immersion state source outside `useImmersionStore`.
- Do not redesign FullPlayer layout/content in this instruction.

## Required Patterns
- Single-source open/close control via `useImmersionStore`.
- Keep Zustand atomic selectors in touched components.
- Prefer existing shared UI primitives (`components/ui/drawer`) over custom wrappers.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH docs listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `rg -n "@use-gesture/react" apps/lite/src`
  - `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/FullPlayer.drawer.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-11
