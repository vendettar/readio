> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Instruction 004 must be completed first (Tailwind tokens registered).

# Task: Migrate Legacy CSS Variable Patterns to Semantic Tailwind Tokens [COMPLETED]

## Objective
Replace all `[var(--...)]` arbitrary value patterns in code and documentation with the semantic Tailwind tokens registered in Instruction 004. This ensures consistency, improves readability, and enables IDE autocomplete.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes, only code cleanup).

## Bilingual Sync
- **Required / Not applicable**: Required (documentation updates).

---

## Token Mapping Reference

The following CSS variables are mapped to Tailwind spacing keys:

| CSS Variable | Tailwind Spacing Key | Example Classes |
|--------------|---------------------|-----------------|
| `--page-margin-x` | `page` | `px-page`, `py-page`, `p-page`, `mx-page`, `my-page`, `m-page`, `pl-page`, `pr-page`, `pt-page`, `pb-page`, `ml-page`, `mr-page`, `mt-page`, `mb-page`, `gap-page`, `space-x-page`, `space-y-page` |
| `--page-gutter-x` | `gutter` (for padding/margin) **or** `page-gutter` (for positioning/inset) | **Padding/Margin**: `px-gutter`, `py-gutter`, `p-gutter`, `mx-gutter`, `my-gutter`. **Positioning**: `left-page-gutter`, `-left-page-gutter`, `right-page-gutter`, `inset-x-page-gutter`, `gap-page-gutter`. |
| `--sidebar-width` | `sidebar` | `w-sidebar`, `left-sidebar`, `ml-sidebar` |
| `--mini-player-height` | `mini-player` | `h-mini-player`, `pb-mini-player`, `pt-mini-player`, `bottom-mini-player` |

> **Rule**: If you encounter a `[var(--...)]` pattern not explicitly listed in the examples above, apply the same token mapping principle. For example, `gap-[var(--page-margin-x)]` → `gap-page`. Document any new patterns discovered in the Completion section.

---

## Scope

### 1. Code Files (`apps/lite/src/**/*.tsx`, `*.ts`)

> **Note**: Do NOT modify `src/index.css` — that file contains the token definitions (source of truth).

**Common Replacement Patterns**:

| Legacy Pattern | Replacement | Notes |
|----------------|-------------|-------|
| `px-[var(--page-margin-x)]` | `px-page` | Token `page` maps to `--page-margin-x`. |
| `py-[var(--page-margin-x)]` | `py-page` | Same token, vertical direction. |
| `p-[var(--page-margin-x)]` | `p-page` | Same token, all sides. |
| `mx-[var(--page-margin-x)]` | `mx-page` | Same token, used as margin. |
| `my-[var(--page-margin-x)]` | `my-page` | Same token, vertical margin. |
| `pl-[var(--page-margin-x)]` | `pl-page` | Left padding. |
| `pr-[var(--page-margin-x)]` | `pr-page` | Right padding. |
| `pt-[var(--page-margin-x)]` | `pt-page` | Top padding. |
| `pb-[var(--page-margin-x)]` | `pb-page` | Bottom padding. |
| `px-[var(--page-gutter-x)]` | `px-gutter` | Token `gutter` maps to `--page-gutter-x`. |
| `py-[var(--page-gutter-x)]` | `py-gutter` | Same token, vertical direction. |
| `-left-[var(--page-gutter-x)]` | `-left-page-gutter` | Negative left offset. Uses `spacing.page-gutter`. |
| `left-[var(--page-gutter-x)]` | `left-page-gutter` | Positive left offset. |
| `w-[var(--sidebar-width)]` | `w-sidebar` | Sidebar width. |
| `h-[var(--mini-player-height)]` | `h-mini-player` | Mini player height. |
| `pb-[var(--mini-player-height)]` | `pb-mini-player` | Bottom padding for player. |
| `pt-[var(--mini-player-height)]` | `pt-mini-player` | Top padding variant. |

### 2. Documentation Files (`apps/docs/content/docs/**/*.mdx`)

Update any code examples or guidelines that reference the legacy patterns:
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.zh.mdx`
- `apps/docs/content/docs/general/design-system/tokens.mdx`
- `apps/docs/content/docs/general/design-system/tokens.zh.mdx`

---

## Steps

### Step 1: Audit
Run the following to identify all occurrences (using `rg` / ripgrep):
```bash
# Code files (excluding token source)
rg -n "\[var\(--page-" apps/lite/src -g '!apps/lite/src/index.css'
rg -n "\[var\(--sidebar" apps/lite/src
rg -n "\[var\(--mini-player" apps/lite/src

# Documentation files
rg -n "\[var\(--page-" apps/docs/content
rg -n "\[var\(--sidebar" apps/docs/content
rg -n "\[var\(--mini-player" apps/docs/content
```

### Step 2: Replace in Code
Perform search-and-replace for each pattern. Use your IDE or `sed`:
```bash
# Example (run from apps/lite):
find src \( -name "*.tsx" -o -name "*.ts" \) -print0 | xargs -0 sed -i '' 's/px-\[var(--page-margin-x)\]/px-page/g'
```

### Step 3: Replace in Documentation
Update the documentation to recommend the new semantic classes instead of the legacy patterns. Ensure both `.mdx` and `.zh.mdx` files are updated.

### Step 4: Verify
- **Type Check**: `pnpm --filter @readio/lite exec tsc --noEmit`
- **Lint**: `pnpm --filter @readio/lite exec biome check .`
- **Build**: `pnpm --filter @readio/lite build`
- **Visual Check**: Manually verify that the layout has not changed (spacing, alignment).

---

## Exclusions
- Do NOT replace `var(--...)` in `src/index.css` — those are the source definitions.
- Do NOT replace `var(--...)` inside JavaScript/TypeScript runtime logic (e.g., `getComputedStyle`).
- **Dynamic CSS Variables**: Variables set at runtime via JavaScript are exempt. Using `[var(...)]` is the correct approach for values that change dynamically. These are NOT design system tokens. Known examples:
  - `--progress` — Playback progress percentage
  - `--column-width` — Grid column width (calculated based on container)
  - `--item-width` — List/grid item width (layout-dependent)
  - `--drag-preview-w` — Drag preview element width
  - `--storage-percent` — Storage usage bar percentage
- If a pattern uses a CSS variable not registered in Tailwind config, leave it as-is and note it in the Completion report.

## Impact Map
- **All Pages**: Verify horizontal margins are still 48px (3rem) from sidebar.
- **Player Bar Area**: Verify bottom padding still reserves space for mini player.
- **Sidebar**: Verify sidebar width is consistent.
- **Episode Row Hover**: Verify `-left-page-gutter` correctly positions the hover background layer.

---

## Completion
- **Completed by**: Readio Worker (Coder)
- **Commands** (all returned 0 results):
  ```bash
  # Code verification
  rg "\[var\(--page-" apps/lite/src -g '!apps/lite/src/index.css'
  rg "\[var\(--sidebar" apps/lite/src
  rg "\[var\(--mini-player" apps/lite/src
  
  # Docs verification
  rg "\[var\(--page-" apps/docs/content
  rg "\[var\(--sidebar" apps/docs/content
  rg "\[var\(--mini-player" apps/docs/content
  
  # Build verification
  pnpm --filter @readio/lite build
  ```
- **New Patterns Discovered**:
  - `w-[var(--page-gutter-x)]` → `w-page-gutter` (GutterPlayButton)
  - `w-[calc(100%-var(--sidebar-width))]` → Retained as `calc()` expression (MiniPlayer, cannot be simplified)
- **Date**: 2026-01-19
- **Reviewed by**: Readio Reviewer (QA)
