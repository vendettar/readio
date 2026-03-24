# Task: 092b - Replace Drawer Shell with Pure Motion Surface Frame

## Precondition (Must)
- `completed/089b-docked-transcript-surface-mode.md` is implemented and review-signed.
- `completed/089c-unify-full-docked-surface-motion.md` is implemented and review-signed.
- This instruction supersedes Drawer-based interaction shell decisions in 092.

## Objective
Remove `Drawer` (`vaul`) from player surface rendering and implement a pure Framer Motion shell that keeps one continuous surface across `docked` and `full`.

## Product Decision (Fixed)
1. `PlayerSurfaceFrame` is the only shell for `docked` and `full`.
2. No `Drawer` wrapper in `PlayerSurfaceFrame`.
3. Dismiss behavior in full mode is handled by explicit frame logic, not Drawer lifecycle callbacks.
4. `docked <-> full` transition remains single-action morph with shared layout identity.
5. No new side panel. No new route behavior.
6. Existing functional behavior remains unchanged:
   - full minimize exits to `toDocked` when restorable, else `toMini`,
   - docked collapse exits to `mini`,
   - transcript interactions stay unchanged.

## Scope Scan (Required)
- Config:
  - No runtime config/env changes.
- Persistence:
  - No DB/storage schema changes.
- Routing:
  - No route additions and no route redirects.
- Logging:
  - No new production logs.
- Network:
  - No API changes.
- Storage:
  - No localStorage/IndexedDB contract changes.
- UI state:
  - Keep `playerSurfaceStore` as the single state authority.
- Tests:
  - Replace Drawer-specific shell tests with Motion-shell behavior tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - rapid mode toggles must not produce stale close callbacks.
- Hot-path performance:
  - no layout thrash from extra wrappers.
- State transition integrity:
  - full close path must always land in deterministic target state.
- Dynamic context consistency:
  - `ReadingContent` mount persistence must be guaranteed by topology (single instance), not only by intent/comments.

## Implementation Steps (Execute in Order)
1. **Remove Drawer from PlayerSurfaceFrame**
   - Update:
     - `apps/lite/src/components/AppShell/PlayerSurfaceFrame.tsx`
   - Remove imports from `components/ui/drawer`.
   - Remove `<Drawer>` and `<DrawerContent>` wrappers.
   - Render the existing `frame` directly with the same mode-driven motion behavior.

2. **Implement explicit full-dismiss shell behavior**
   - Keep full-mode minimize button path unchanged (`handleExit`).
   - Disable backdrop/frame click close in full mode.
   - Keep docked mode non-modal with no backdrop close path.

3. **Preserve motion continuity and topology**
   - Keep `PLAYER_SURFACE_LAYOUT_ID` as shared identity.
   - Keep one mounted `PlayerSurfaceFrame` in AppShell for non-mini modes.
   - Keep `ReadingContent` persistence behavior unchanged across `docked <-> full`.
   - Enforce a single persistent `ReadingContent` mount slot across mode switches:
     - do not render separate docked/full branch instances,
     - mode-specific chrome must wrap/toggle around one shared content instance.

4. **Remove Drawer-specific test assumptions**
   - Replace Drawer-mock-based tests with frame-behavior tests.
   - Update:
     - `apps/lite/src/components/AppShell/__tests__/FullPlayer.drawer.test.tsx`
   - Rename and repurpose to a shell-agnostic dismiss test:
     - `apps/lite/src/components/AppShell/__tests__/PlayerSurfaceFrame.dismiss.test.tsx`
   - Assert:
     - minimize closes to correct target state,
     - full frame/background click does not dismiss,
     - docked has no backdrop close effect.

5. **Keep persistence and morph tests green**
   - Validate and update if needed:
     - `apps/lite/src/components/AppShell/__tests__/PlayerSurfaceFrame.persistence.test.tsx`
     - `apps/lite/src/components/AppShell/__tests__/AppShell.surface-morph.test.tsx`
     - `apps/lite/src/components/AppShell/__tests__/AppShell.player-surface-mode.test.tsx`

6. **Legacy cleanup closure (required)**
   - After migration, remove obsolete Drawer shell artifacts for this player-surface domain:
     - if no runtime usage remains, delete `apps/lite/src/components/ui/drawer.tsx`,
     - remove `vaul` from `apps/lite/package.json` when no runtime usage remains.
   - If `drawer`/`vaul` must remain for non-player use, document the retained owner/use case explicitly in handoff docs.

7. **Documentation sync (atomic)**
   - Update Drawer references to Motion-shell references in:
     - `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
   - Update decision records:
     - `apps/docs/content/docs/general/decision-log.mdx`
     - `apps/docs/content/docs/general/decision-log.zh.mdx`
   - Add a new reversal decision entry that supersedes Drawer-shell decision in this surface domain.

## Acceptance Criteria
- `PlayerSurfaceFrame` no longer imports or renders `Drawer`.
- `full -> docked` and `docked -> full` remain continuous single-action morph.
- Full-mode close paths work from:
  - minimize button,
  - `Esc` shortcut (existing keyboard contract).
- Full-mode frame/background clicks do not dismiss.
- Docked mode remains interactive and non-modal.
- No regressions in transcript interaction behavior.

## Required Tests
1. Add:
   - `apps/lite/src/components/AppShell/__tests__/PlayerSurfaceFrame.dismiss.test.tsx`
   - cover full minimize close target, full frame click non-dismiss, docked non-modal behavior.
2. Update:
   - `apps/lite/src/components/AppShell/__tests__/PlayerSurfaceFrame.persistence.test.tsx`
   - remove Drawer mocking and assert mount persistence still holds.
   - explicitly assert no remount of `ReadingContent` across `docked <-> full` transitions (e.g., mount counter/effect probe equals 1).
3. Update:
   - `apps/lite/src/components/AppShell/__tests__/AppShell.surface-morph.test.tsx`
   - assert single frame topology in non-mini modes.
4. Remove or rewrite:
   - `apps/lite/src/components/AppShell/__tests__/FullPlayer.drawer.test.tsx`
   - Drawer-specific API assertions must not remain.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `rg -n \"components/ui/drawer|Drawer|vaul\" apps/lite/src -S`
- `rg -n \"Drawer|vaul\" apps/docs/content/docs/apps/lite/handoff -S`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/PlayerSurfaceFrame.dismiss.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/PlayerSurfaceFrame.persistence.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/AppShell.surface-morph.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/AppShell/PlayerSurfaceFrame.tsx`
  - `apps/lite/src/components/AppShell/AppShell.tsx` (verify only, adjust if needed)
  - `apps/lite/src/components/AppShell/ReadingContent.tsx`
  - `apps/lite/src/components/ui/drawer.tsx` (remove if unused)
  - `apps/lite/package.json` (`vaul` cleanup if unused)
  - AppShell surface tests listed above
  - docs listed in step 7
- Regression risks:
  - full dismiss path drift after removing Drawer callback path
  - accidental close due to unintended container click handlers
  - style layering regressions between surface and sidebar
- Required verification:
  - dismiss tests pass
  - persistence/morph tests pass
  - full app build passes

## Forbidden Dependencies
- Do not add another modal/sheet library.
- Do not reintroduce Drawer into player surface shell.
- Do not change transcript business logic.
- Do not change route model.

## Required Patterns
- Single motion-driven shell for player surface states.
- Deterministic close-path mapping via `playerSurfaceStore`.
- Keep state selectors atomic in touched components.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update EN/ZH docs listed in step 6.
