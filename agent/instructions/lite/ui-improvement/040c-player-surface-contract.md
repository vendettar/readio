# Instruction 040c: Player Surface Contract [COMPLETED]

## Goal
Define and verify a player-only overlay/focus/dismiss contract for Lite player surfaces (`mini`, `docked`, `full`) under the parent 040 Phase-0 split model, with explicit current/target/delta evidence and no cross-family cleanup.

## Parent Reference
- `agent/instructions/lite/ui-improvement/040-overlay-layering-and-focus-contract.md`

## Scope Boundary
- In scope:
  - `apps/lite/src/components/AppShell/AppShell.tsx`
  - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
  - `apps/lite/src/components/AppShell/PlayerSurfaceFrame.tsx`
  - `apps/lite/src/components/AppShell/__tests__/PlayerSurfaceFrame.dismiss.test.tsx`
  - `apps/lite/src/store/playerSurfaceStore.ts`
- Out of scope:
  - Search / command palette (`040a`)
  - Transcript selection / lookup (`040b`)
  - Discovery overlays (`040d`)

## 8-Scope Pre-Implementation Scan (Player Slice)
1. Config & env parsing
   - No env/config dependency in player overlay contract logic.
2. Persistence & data integrity
   - No storage/table/schema operations in this slice.
3. Routing & param validation
   - `AppShell` listens to `popstate`; docked mode collapses to mini on browser back.
4. Logging & error handling
   - No explicit error channel for focus failures; behavior must be proved by tests.
5. Network & caching
   - Not involved.
6. Storage & serialization
   - Not involved.
7. UI state & hooks
   - High-risk surface logic in `PlayerSurfaceFrame` (`Escape`, focus trap, inert sibling handling, restore focus).
8. Tests & mocks
   - Existing coverage present; focus-restore and right-click dismissal needed explicit regression anchors.

## Player Overlay Inventory

| Surface | In Scope | Notes |
| :--- | :--- | :--- |
| Mini player bar (`MiniPlayer`) | Yes | Persistent shell control bar, not modal, no dismiss overlay semantics. |
| Docked player surface (`PlayerSurfaceFrame` in `docked`) | Yes | Non-modal fixed surface anchored above mini player and to the right of sidebar. |
| Full player surface (`PlayerSurfaceFrame` in `full`) | Yes | Modal dialog surface with focus trap, inert siblings, explicit exit controls. |
| Full player settings popover (`Popover` in footer) | Not applicable (this slice) | Out of scope for `040c`; this pass governs player surface shell modal contract only. |

## Current / Target / Delta Contract Matrix (Player Only)

| Property | Current (Observed) | Target | Delta |
| :--- | :--- | :--- | :--- |
| Open trigger: `mini -> docked` | `MiniPlayer` toggle/expand action via `toDocked` when context exists | Explicit store-guarded mode transition | None |
| Open trigger: `docked -> full` | Docked header expand button (`ariaOpenQueue`) calls `toFull` when transcript/full view is meaningful | Explicit action-gated transition | None |
| Surface type | One shared `PlayerSurfaceFrame` morphing between `docked`/`full` (single instance) | Preserve single-surface continuity | None |
| Modal vs non-modal | `full`: modal (`role=dialog`, `aria-modal=true`); `docked`: non-modal | Explicit split remains | None |
| Initial focus (`full`) | Targets full minimize button in both active-track and no-track full states; if unavailable, falls back to first focusable in modal | Deterministic first focus target for all valid full-mode states | Runtime behavior tightened for `full + !hasActiveTrack` |
| Focus restore (`full` exit) | Restores to docked expand origin trigger when full was entered from docked expand; otherwise falls back to previous external focus, docked minimize, then sidebar control | Deterministic restore chain with explicit origin-trigger priority | Runtime behavior tightened for docked-origin full sessions |
| Outside left click (`full`) | No outside region (full viewport owned by modal frame); no click-to-dismiss path | Dismiss only by explicit controls / `Escape` | None |
| Outside right click (`full`) | Frame right-click does not invoke dismiss handlers | No implicit dismiss on context menu gesture | None (new regression test added) |
| Outside interaction (`docked`) | Frame click does not dismiss; collapse is explicit via minimize/action or route transitions | Non-modal explicit-dismiss model | None |
| Escape behavior (`full`) | Frame-level `Escape` exits only when no nested player-owned overlay is active; nested overlay `Escape` is prioritized | Deterministic keyboard dismissal with nested-overlay priority | Runtime behavior tightened to avoid direct full-surface dismissal while nested overlay handles `Escape` |
| Portal boundary | Player surfaces render in `AppShell` tree (no `document.body` portal) | Keep non-portal player frame topology | None |
| Z-index token usage | Full/docked use CSS variables (`--z-full-player`, `--z-docked-player`); mini/sidebar tokens also semantic | Keep token-only layering (no magic numbers) | None |
| Mobile / narrow-width behavior | Full mode switches to mobile header/artwork layout; controls remain dismissible via minimize and `Escape` (keyboard) | Preserve reachable dismiss controls and unclipped layout | None |

## Evidence
- Runtime implementation:
  - `apps/lite/src/components/AppShell/PlayerSurfaceFrame.tsx`
  - `apps/lite/src/components/AppShell/AppShell.tsx`
  - `apps/lite/src/components/AppShell/MiniPlayer.tsx`
  - `apps/lite/src/store/playerSurfaceStore.ts`
- Regression anchors:
  - `apps/lite/src/components/AppShell/__tests__/PlayerSurfaceFrame.dismiss.test.tsx`
    - verifies right-click does not dismiss
    - verifies restore-focus to previously focused external element on `full -> docked` exit

## Notes
- No durable handoff or rule-doc updates were applied in this slice; this artifact is the reviewable matrix required by parent 040 split execution.
- This corrective pass introduced a behavior delta for full-mode focus entry in the no-track branch, and added regression coverage for focus containment.
- This corrective pass also tightened full-mode `Tab` containment when focus drifts outside the modal, forcing focus back to the first/last in-surface target.
- This reopened pass adds docked-expand origin-trigger focus restoration and nested player-overlay `Escape` priority handling.
- Player-owned nested overlays in full mode must register both: (1) explicit open-state wiring to frame-level `hasActivePlayerOwnedOverlay`, and (2) ownership marker `data-player-overlay-owned="true"` so Escape priority remains contract-driven.

## Completion
- Completed by: Worker Agent (Codex)
- Reviewed by: Reviewer Agent (Codex)
- Commands:
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/PlayerSurfaceFrame.dismiss.test.tsx`
  - `pnpm -C apps/lite exec biome check src/components/AppShell/PlayerSurfaceFrame.tsx src/components/AppShell/__tests__/PlayerSurfaceFrame.dismiss.test.tsx`
  - `pnpm lint` (fails in existing Selection-family files outside this player slice)
  - `pnpm typecheck`
- Date: 2026-03-17
