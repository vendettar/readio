---
description: Harden dictionary overlay positioning and viewport geometry guarantees
---

# Instruction 134b: Pause On Dictionary Lookup - Positioning Hardening [COMPLETED]

Goal: make selection dictionary overlay placement deterministic across docked/full layouts and viewport boundaries.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/lite/src/components/Selection/SelectionUI.tsx`
- `apps/lite/src/components/Selection/__tests__/SelectionUI.keyboard.test.tsx`

## Scope Scan Report (8 Required Scopes)
- Config: Low risk. No config mutation.
- Persistence: Low risk. No storage state changes.
- Routing: Low risk. No route changes.
- Logging: Low risk. No new logs.
- Network: Low risk. No fetch behavior change.
- Storage: Low risk. No IndexedDB interaction.
- UI state: High risk. Overlay placement regressions can block lookup actions.
- Tests: High risk. Need geometry assertions beyond keyboard contracts.

## Implementation Scope
- `apps/lite/src/components/Selection/SelectionUI.tsx`
- `apps/lite/src/components/Selection/__tests__/SelectionUI.keyboard.test.tsx`
- add dedicated placement test file if needed

## Required Changes
1. Keep rendering via `createPortal(..., document.body)`.
2. Position from viewport coordinates and clamp within viewport bounds.
3. Enforce minimum anchor gap (`>= 8px`) and default non-overlap with anchor.
4. Preserve stable behavior in transformed containers (docked/full).
5. Keep keyboard contracts unchanged (Esc close, focus behavior).

## Hidden Risk Sweep
- Async control flow: rapid selection/resize must not leave stale coordinates.
- State transition integrity: open/close transitions must not trap focus.
- Dynamic context consistency: positioning recalculates correctly after layout mode change.
- Hot-path performance: position math remains O(1), no layout thrash loops.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/Selection/__tests__/SelectionUI.keyboard.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Selection/__tests__/SelectionUI.positioning.test.tsx` (if created)

## Acceptance Criteria
1. Overlay remains visible and clamped in narrow and wide viewports.
2. Overlay keeps minimum anchor gap and default non-overlap.
3. Docked/full mode transitions do not break overlay placement.
4. Existing keyboard behavior remains unchanged.

## Impact Checklist
- Affected modules:
  - selection overlay rendering
  - selection overlay positioning tests
- Regression risks:
  - overlay rendered off-screen
  - overlap with anchor causing blocked interaction
  - transformed parent causing coordinate drift
- Required verification:
  - all commands above pass
  - manual smoke in docked/full transcript surfaces

## Required Patterns / Forbidden Dependencies
- Required patterns:
  - portal to `document.body`
  - viewport-based clamped positioning
- Forbidden dependencies:
  - no transform hacks tied to specific route layout
  - no keyboard behavior regressions

## Decision Log
- Required: Waived (UI positioning hardening only; no architecture pivot).

## Bilingual Sync
- Required: Yes.
- Update:
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/components/Selection/__tests__/SelectionUI.keyboard.test.tsx`
  - `pnpm -C apps/lite test:run -- src/components/Selection/__tests__/SelectionUI.positioning.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Selection/__tests__/SelectionUI.keyboard.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/Selection/__tests__/SelectionUI.positioning.test.tsx`
- Date: 2026-03-10
