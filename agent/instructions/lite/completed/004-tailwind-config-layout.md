> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Update Tailwind Config (Layout Tokens) [COMPLETED]

## Objective
The `apps/lite/src/index.css` file defines several layout CSS variables (`--sidebar-width`, `--mini-player-height`, `--page-margin-x`).
Currently, these are not exposed as Tailwind utilities, forcing developers to use `calc()` or arbitrary values.
We must register them in `tailwind.config.js` to enable "Vibe Coding" with standard classes.

## 1. Inspect `src/index.css`
- Note the variable names:
  - `--sidebar-width`
  - `--mini-player-height`
  - `--page-margin-x`
  - `--page-gutter-x`

## 2. Update `apps/lite/tailwind.config.js`
- **Extend `theme.extend`**:
  - **Spacing**: Add `sidebar`, `mini-player`, `page-gutter`.
    ```js
    spacing: {
      sidebar: 'var(--sidebar-width)',
      'mini-player': 'var(--mini-player-height)',
      'page-gutter': 'var(--page-gutter-x)',
    }
    ```
  - **Width**: Add `sidebar`.
  - **Height**: Add `mini-player`.
  - **Padding/Margin**: Add `page` mapping to `var(--page-margin-x)`.
  - **Padding/Margin**: Add `gutter` mapping to `var(--page-gutter-x)` (useful for mobile layouts).

## 3. Verify
- **Build**: Run `pnpm --filter @readio/lite build`.
- **Logic**: Ensure the build passes and tokens are valid.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.

---
## Documentation
- Update `apps/docs/content/docs/general/design-system/index.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Readio Worker (Coder)
- **Commands**: 
  - `pnpm --filter @readio/lite build`
  - `pnpm --filter @readio/lite exec tsc --noEmit`
  - `pnpm --filter @readio/lite exec biome check .`
- **Date**: 2026-01-19
- **Reviewed by**: Readio Reviewer (QA)
