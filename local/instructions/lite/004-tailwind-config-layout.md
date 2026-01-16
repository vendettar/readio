> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Update Tailwind Config (Layout Tokens)

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
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
