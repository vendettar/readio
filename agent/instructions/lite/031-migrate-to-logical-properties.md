> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Migrate to Logical Properties (RTL)

## Objective
Ensure the app supports Right-to-Left languages (Arabic, Hebrew) by replacing physical CSS properties (left/right) with logical ones (start/end).

## 1. Audit CSS/Tailwind
- **Action**: Use a linter or manual search for `left-`, `right-`, `ml-`, `mr-`, `pl-`, `pr-`.
- **Replace**:
  - `ml-` -> `ms-` (margin-inline-start)
  - `mr-` -> `me-` (margin-inline-end)
  - `pl-` -> `ps-`
  - `pr-` -> `pe-`
  - `left-0` -> `start-0`
  - `right-0` -> `end-0`
  - `text-left` -> `text-start`

## 2. Refactor Components
- **Target**: `Sidebar.tsx` (Logo alignment), `EpisodeRow.tsx` (Image margin), `FullPlayer.tsx` (Controls).
- **Action**: Apply the replacements.

## 3. Icons
- **Rule**: Icons that signify direction (ArrowLeft, ChevronRight) should usually flip in RTL.
  - **Auto**: `lucide-react` does NOT auto-flip.
  - **Fix**: Use `className="rtl:rotate-180"` for directional icons.

## 4. Verification
- **Test**: Temporarily add `dir="rtl"` to `<html>` in `index.html`.
- **Check**: Sidebar should move to the right (if `fixed`). Text alignment should flip.
- **Cleanup**: Remove `dir="rtl"` before committing.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/accessibility.mdx`.
- Update `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
