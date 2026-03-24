# Instruction A: Z-Index + Static Arbitrary Cleanup (Blocking)

## Scope
- `apps/lite/src/components/**`
- `apps/lite/src/components/ui/**`
- `apps/lite/tailwind.config.js`
- `apps/lite/src/index.css`

## Must Fix
1) **Z-Index tokens only**
- Use existing tokens: `z-sidebar`, `z-mini-player`, `z-overlay`, `z-modal`, `z-full-player`, `z-menu`.
- Remove all `z-50/z-40/z-30/z-20/z-10` and `-z-10`.
- Replace negative z-index with DOM order + `pointer-events-none`.

2) **Static arbitrary values**
- **Allowed Exception**: Dynamic CSS variables used for interaction/positioning are allowed (e.g. `start-[var(--x)]`). All other static `[...]` must be removed.
- `dialog.tsx` / `alert-dialog.tsx`: replace `start-[50%] top-[50%] translate-...` with `start-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`.
- Remove `slide-in-from-top-[48%]` / `slide-out-to-top-[48%]` style classes.
- `command.tsx`: `max-h-[300px]` → `max-h-72` or `max-h-80`.
- Replace static `calc(...)` / `inset` patterns with tokens:
  - `absolute inset-[-4px] w-[calc(100%+8px)] h-[calc(100%+8px)]` → `absolute -inset-1 w-full h-full`.
  - `absolute -inset-[1px] w-[calc(100%+2px)] ...` → `absolute -inset-px w-full h-full`.
- `MiniPlayer` `w-[calc(100%-var(--sidebar-width))]`:
  - Register `width.shell-content: 'calc(100% - var(--sidebar-width))'` in `tailwind.config.js`.
  - Use `w-shell-content`.

## Acceptance
- `rg -n "\\bz-(50|40|30|20|10)\\b|-z-10" apps/lite/src/components` → 0 lines.
- `rg -n "\\w-\\[calc\\(|\\binset-\\[-|start-\\[|top-\\[|translate-[xy]-\\[" apps/lite/src/components` → 0 lines.
