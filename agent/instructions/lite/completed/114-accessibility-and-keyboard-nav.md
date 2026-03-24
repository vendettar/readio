# Task: 114 - Accessibility Baseline Hardening (Phase 1) [COMPLETED]

## Objective
Implement high-impact, low-risk accessibility fixes for command palette, selection menu, and player controls, without introducing transcript cursor-mode complexity.

## Product Decision (Fixed)
1. Phase 1 includes only baseline a11y hardening.
2. Do not implement transcript virtual cursor/caret navigation in this phase.
3. Keep command palette behavior aligned with `093` popover architecture.
4. Enforce keyboard close/navigation contracts:
   - `Esc` closes open overlays/menus.
   - arrow-key menu navigation works where applicable.
5. Ensure custom player controls have correct ARIA and keyboard semantics.
6. Defer advanced transcript keyboard model to `114b`.

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
  - No feature behavior changes; accessibility semantics and keyboard support only.
- Tests:
  - Add focused a11y interaction tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - open/close state races between keyboard shortcuts and popover `onOpenChange` must remain deterministic.
- Hot-path performance:
  - no high-frequency event loops added.
- State transition integrity:
  - overlay/menu states cannot get stuck open.
- Dynamic context consistency:
  - translated aria labels remain correct on language change.

## Implementation Steps (Execute in Order)
1. **Selection menu focus and key behavior**
   - Update relevant selection/menu components.
   - Ensure focusable menu container, `Esc` close, and arrow-key item navigation.

2. **Command palette keyboard/a11y parity**
   - Build on `093` popover structure.
   - Ensure proper `aria-expanded`, `aria-controls`, and deterministic keyboard close behavior.

3. **Player control semantics audit**
   - Verify and fix slider/button keyboard+ARIA semantics in Mini/Full player controls.

4. **Docs sync (atomic)**
   - Update accessibility and standards docs with baseline contracts.

## Acceptance Criteria
- Core command palette and selection menu are fully keyboard closable/navigable.
- Player custom controls expose correct ARIA semantics.
- No regressions in existing interaction behavior.

## Required Tests
1. Add/update command palette keyboard tests.
2. Add/update selection menu keyboard/focus tests.
3. Add/update player control a11y tests.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
