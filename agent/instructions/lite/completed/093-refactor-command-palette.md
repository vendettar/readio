# Task: 093 - CommandPalette Inline UX Hardening (Popover Portal + cmdk) [COMPLETED]

## Objective
Upgrade `CommandPalette` implementation to a standard, portal-based popover architecture while preserving current sidebar inline UX and visual style.

This task explicitly does **not** migrate to centered/global modal dialog.

## Product Decision (Fixed)
1. Keep the current product interaction model:
   - Sidebar inline search input remains in place.
   - Result panel opens under the input in the same visual position.
2. Do not use centered `CommandDialog` modal for this task.
3. Use standard portal-backed popover behavior for the results panel (no manual fake overlay container).
4. Keep cmdk-based list behavior and keyboard navigation.
5. Keep `Cmd+K` global shortcut behavior unchanged.
6. Keep existing visual style tokens (glass, border, spacing, typography) unchanged unless required by primitive API.

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
  - No remote search API contract change.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - Keep `useSearchStore` contract (`query`, `isOverlayOpen`, `openOverlay`, `closeOverlay`).
- Tests:
  - Update command palette tests to validate popover open/close and keyboard path.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Ensure query-driven debounce/search requests remain unaffected by popover refactor.
  - Prevent open/close race between `Cmd+K`, input focus, and `onOpenChange`.
- Hot-path performance:
  - Avoid extra re-renders from uncontrolled popover state.
  - Keep result rendering limits and existing caps unchanged.
- State transition integrity:
  - `Esc` closes palette deterministically.
  - click outside closes palette deterministically.
  - selecting item closes palette before navigation/play action.
- Dynamic context consistency:
  - Offline/online mode section visibility remains unchanged.
  - local/remote result grouping behavior remains unchanged.

## Implementation Steps (Execute in Order)
1. **Refactor CommandPalette shell to standard popover**
   - Update:
     - `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
   - Replace manual absolute result panel + `useOnClickOutside` with `Popover` primitives:
     - `Popover`
     - `PopoverAnchor`
     - `PopoverContent`
   - Do not introduce custom "equivalent" overlay containers; only standard popover anchor/content composition is allowed.
   - `open` must be controlled by `useSearchStore.isOverlayOpen`.
   - `onOpenChange(false)` must call `closeOverlay()`.

2. **Preserve inline input UX**
   - Keep the input rendered inline inside sidebar (not modal).
   - Keep existing keyboard hint (`⌘ K`) behavior and visual placement.
   - Keep focus behavior deterministic when open/close toggles.

3. **Standardize cmdk input composition**
   - Use existing `ui/command` primitives consistently.
   - Replace direct `CommandPrimitive.Input` usage with `CommandInput` from `components/ui/command`.
   - Maintain current query binding and `onValueChange={setQuery}` semantics.

4. **Remove obsolete outside-click utility usage**
   - Remove `useOnClickOutside` usage from `CommandPalette`.
   - Keep `useOnClickOutside` hook file if still used by other modules.

5. **Preserve existing result semantics**
   - Do not change:
     - section grouping order
     - per-section limits
     - offline local-only behavior
     - default hidden action behavior for Enter-to-search-page
   - Keep item select handlers and close-before-action ordering.

6. **Test updates**
   - Update:
     - `apps/lite/src/components/GlobalSearch/__tests__/CommandPalette.test.tsx`
   - Remove assumptions tied to `useOnClickOutside` mocking.
   - Add explicit assertions:
     - open via store/open action
     - close via `Esc`
     - close via popover outside interaction path (`onOpenChange(false)`)
     - `Cmd+K` toggle behavior remains valid via keyboard shortcut hook integration or targeted store toggling assertions.

7. **Documentation sync (atomic)**
   - Update search handoff docs to reflect:
     - inline sidebar UX preserved
     - panel is now portal-backed popover implementation
     - not a centered dialog.

## Acceptance Criteria
- Search input remains inline in sidebar.
- Result panel appears in the same visual location and style as current UX.
- Panel is rendered through standard popover/portal primitives.
- `Cmd+K`, `Esc`, click outside, and item selection close behavior all work.
- No regression in local/remote result grouping and limits.
- No `useOnClickOutside` dependency in `CommandPalette`.

## Required Tests
1. `apps/lite/src/components/GlobalSearch/__tests__/CommandPalette.test.tsx`
   - open/close state transitions
   - esc close
   - outside-close path
   - default action reselection behavior remains intact
   - `Cmd+K` and `Esc` keyboard interaction assertions with store integration (in this file or a dedicated keyboard test file).

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/GlobalSearch/__tests__/CommandPalette.test.tsx`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
  - `apps/lite/src/components/GlobalSearch/__tests__/CommandPalette.test.tsx`
  - `apps/lite/src/components/ui/command.tsx` (only if minor API compatibility adjustment is required)
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/search.zh.mdx`
- Regression risks:
  - open/close race with store-controlled state
  - visual position drift after popover portaling
  - keyboard focus regression
- Required verification:
  - behavior parity checks pass
  - search tests pass

## Forbidden Dependencies
- Do not switch to centered/global `CommandDialog` in this instruction.
- Do not redesign sidebar search UI layout.
- Do not change discovery/local search data contracts.

## Required Patterns
- Controlled open state from `useSearchStore`.
- Use existing shared shadcn primitives (`Popover`, `Command*`).
- Keep Zustand atomic selectors in touched files.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`
  - Clarify D052 implementation detail change (inline UX unchanged, popover architecture standardized).

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH docs listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/components/GlobalSearch/__tests__/CommandPalette.test.tsx`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-11
