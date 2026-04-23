# Task: 089b - Add Global Docked Transcript Surface (Mini Extension, Route-Independent) [COMPLETED]

## Precondition (Must)
- `089-refactor-transcript-atomic.md` must be completed and review-signed.

## Objective
Use the **existing standard transcript reading area** (non-full mode) as the docked surface and add collapse behavior:
- playback defaults to `docked` when transcript-capable context exists (otherwise `mini`),
- user can collapse to `mini` from any page,
- user can restore `docked` from MiniPlayer on any page,
- user can still open `full` mode,
- collapse control is placed at the top-right of the existing standard reading area,
- collapse motion is downward into MiniPlayer semantics (not lateral),
- docked is non-modal (sidebar/page remains visible and interactive),
- current route/page must remain unchanged during these transitions.

## Product Decision (Fixed)
1. Player surface becomes explicit 3-state model:
   - `mini`
   - `docked`
   - `full`
2. Default entry rule:
   - when user starts playable content with transcript context (files/podcast read-along path), default surface is `docked`.
3. Docked header action rule:
   - top-right shows **collapse only** (`ChevronDown`) for `docked -> mini`.
   - no separate close/remove action in this instruction.
4. Global persistence rule:
   - `docked` can be collapsed/restored on any page (`Explore`, `History`, `Files`, etc.).
   - transitions must not trigger route navigation.
5. MiniPlayer extension rule:
   - MiniPlayer must provide a dedicated restore entry for `mini -> docked`.
   - Full mode entry remains available (`mini/docked -> full`) only when playable context exists.
6. Full mode rule:
   - existing full reading experience remains supported.
   - full-open entry is enabled only when playable context exists.
   - when playable context does not exist, full-open UI is disabled and click is a no-op (no route change, no toast).
   - exiting full returns to `docked` when transcript context exists; otherwise return to `mini`.
7. State authority rule:
   - one global player-surface store owns mode transitions; avoid split authority across route components.
8. Presentation rule:
   - docked must not render as centered dialog.
   - docked must keep the current standard-reading-area visual location/width behavior and must not block page interaction.
9. No-new-region rule:
   - do not introduce any new right-side reading region for this task.
   - implementation must reuse the existing standard reading area and only add collapse/restore control flow.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No DB schema/storage key changes.
- Routing:
  - No route additions; no route-driven mode transitions.
- Logging:
  - Keep existing logging policy unchanged.
- Network:
  - No API changes.
- Storage:
  - No localStorage/IndexedDB contract changes required.
- UI state:
  - Add explicit global surface mode with deterministic transitions.
- Tests:
  - Add store state-machine tests and AppShell integration tests for cross-page restore/collapse behavior.

## Hidden Risk Sweep (Required)
- Async control flow:
  - mode transitions must not race with playback-start initialization.
- Hot-path performance:
  - docked rendering must not introduce full-page rerender churn on progress ticks.
- State transition integrity:
  - invalid transitions (e.g., `mini -> full` without playable context) must be guarded.
  - mode must never get stuck in non-recoverable state.
- Interaction integrity:
  - docked container must not intercept unrelated page interactions outside its own bounds.
- Dynamic context consistency:
  - transcript availability changes (loaded/unloaded) must keep restore button state accurate.

## Implementation Steps (Execute in Order)
1. **Create global player-surface state machine**
   - Add:
     - `apps/lite/src/store/playerSurfaceStore.ts`
   - Required state:
     - `mode: 'mini' | 'docked' | 'full'`
     - `hasPlayableContext: boolean`
     - `canDockedRestore: boolean`
   - Required actions:
     - `toMini()`
     - `toDocked()`
     - `toFull()`
     - capability updater(s) for playback/transcript lifecycle (e.g., `setPlayableContext(...)`, `setDockedRestoreAvailable(...)`).
     - guarded transition helper(s) for invalid-state prevention.
   - Required lifecycle rules:
     - playback start with transcript-capable context => `hasPlayableContext=true`, `canDockedRestore=true`.
     - playback stop/session cleared/no playable context => `hasPlayableContext=false`, `canDockedRestore=false`, mode coerces to `mini`.
     - transcript availability loaded/unloaded must update `canDockedRestore` deterministically without route navigation.

2. **Wire default-to-docked behavior on playback start**
   - Update playback entry paths used by file/podcast play actions.
   - Required behavior:
     - new playback session with transcript-capable context defaults to `docked`.
     - new playback session without transcript-capable context defaults to `mini`.
     - do not navigate routes to enforce this.

3. **Reuse the existing standard reading area as docked surface**
   - Update:
     - `apps/lite/src/components/AppShell/AppShell.tsx`
   - Reuse existing standard transcript reading container; do not add an additional right-side reading container.
   - Required behavior:
      - docked visibility controlled only by global surface mode.
      - collapsing/expanding does not change current page route.
      - docked keeps existing visual placement; sidebar and current page content stay visible/interactive.

4. **Add docked header collapse control**
   - In the existing standard reading area header, add top-right collapse button (`ChevronDown`).
   - Required behavior:
      - click performs `toMini()` only.
      - collapse direction is downward (toward MiniPlayer semantics), not left/right docking.
      - no close/remove semantics.

5. **Extend MiniPlayer with docked restore entry**
   - Update:
     - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
   - Required behavior:
     - add restore action for `mini -> docked` when restore is available.
     - keep existing full-open action available.
     - full-open action must reflect playable-context guard (enabled only when `hasPlayableContext`).
     - keep route unchanged during restore/open transitions.

6. **Integrate full mode with surface state machine**
   - Update:
     - `apps/lite/src/components/AppShell/FullPlayer.tsx`
     - any existing immersion/full-mode state usage
   - Required behavior:
     - full open/exit transitions routed through global surface mode.
     - exiting full returns to `docked` when applicable.

7. **Preserve transcript interaction behavior**
   - Keep `TranscriptView` lookup/highlight/selection semantics unchanged.
   - Do not rework transcript interaction architecture in this instruction.

8. **Docs sync (atomic)**
   - Update audio-engine/architecture docs to document the 3-state surface model and route-independent behavior.

## Acceptance Criteria
- After starting playback in transcript-capable context, default reading surface is `docked`; otherwise `mini`.
- Docked top-right collapse button sends `docked -> mini` and keeps current page unchanged.
- From any page, MiniPlayer can restore `mini -> docked`.
- Full mode is accessible from mini/docked only when playable context exists; otherwise full-open entry is disabled and no-op.
- Exiting full returns to docked when transcript context exists.
- No route jumps occur during surface transitions.
- Docked surface is not a centered dialog and does not block sidebar interaction.
- Docked header provides collapse control only; no close/remove action is shown.
- Existing standard reading area is reused; no new right-side reading panel is introduced.

## Required Tests
1. Add:
   - `apps/lite/src/store/__tests__/playerSurfaceStore.test.ts`
   - Assert allowed/blocked transitions and default transition behavior.
2. Add:
   - `apps/lite/src/components/AppShell/__tests__/AppShell.player-surface-mode.test.tsx`
   - Assert docked visibility, collapse, restore, and route-stability behavior.
   - Assert sidebar/page remains interactive while docked is open (non-modal behavior).
   - Assert docked does not render via dialog semantics (no centered modal role/path).
   - Assert docked header contains collapse action and no close/remove action.
   - Assert only one standard reading surface exists (no additional right-side duplicate container).
3. Update:
   - `apps/lite/src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
   - Assert restore-docked control wiring and coexistence with full-open control.
   - Assert full-open control disabled/no-op behavior when playable context is absent.
4. Update:
   - `apps/lite/src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
   - Assert exit-full transition target behavior.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/store/__tests__/playerSurfaceStore.test.ts`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/AppShell.player-surface-mode.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/store/playerSurfaceStore.ts` (new)
  - `apps/lite/src/components/AppShell/AppShell.tsx`
  - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
  - `apps/lite/src/components/AppShell/FullPlayer.tsx`
  - playback-entry integration owners for default-to-docked behavior:
    - `apps/lite/src/hooks/useEpisodePlayback.ts`
    - `apps/lite/src/hooks/useSession.ts`
    - `apps/lite/src/store/playerStore.ts` (if touched by transition wiring)
  - tests under:
    - `apps/lite/src/store/__tests__/`
    - `apps/lite/src/components/AppShell/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- Regression risks:
  - mode transition race during playback bootstrap
  - unexpected overlay stacking conflicts with existing shell layers
  - inconsistent restore availability state
- Required verification:
  - state-machine tests pass
  - app shell integration tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new state libraries.
- Do not add route-based hacks for panel restore.
- Do not remove full mode.
- Do not introduce a separate close/delete action for docked in this instruction.

## Required Patterns
- Single global mode authority for player surfaces.
- Route-independent UI surface transitions.
- Keep transcript interaction logic architecture unchanged.

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
  - `pnpm -C apps/lite exec vitest run src/store/__tests__/playerSurfaceStore.test.ts`
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/AppShell.player-surface-mode.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/MiniPlayer.controls.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/FullPlayer.controls.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-11
