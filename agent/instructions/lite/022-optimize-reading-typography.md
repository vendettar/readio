> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Optimize Reading Typography [COMPLETED]

## Objective
The reading experience currently uses hardcoded spacing and low line-height (1.4).
We must upgrade the typography to follow the "Golden Ratio" standards (Line Height 1.6, Fluid Zoom) defined in the Design System.

## 1. Configure Global Variables (`apps/lite/src/index.css`)
- **Action**: Define reading variables to drive the `prose` or custom styles:
  - `--reading-line-height: 1.6`
  - `--reading-para-spacing: 1.2em`
  - `--reading-font-size: 1rem` (Base, will be zoomed)

## 2. Update `apps/lite/tailwind.config.js` (Optional but Recommended)
- **Action**: If using `@tailwindcss/typography`, extend the theme to use these variables.
  ```js
  typography: {
    DEFAULT: {
      css: {
        lineHeight: 'var(--reading-line-height)',
        p: { marginBottom: 'var(--reading-para-spacing)' },
        fontSize: 'var(--reading-font-size)',
      }
    }
  }
  ```

## 3. Refactor Transcript View & Zoom
- **Target**: `apps/lite/src/components/Transcript/TranscriptView.tsx` (and `useZoom` hook).
- **Action**: Apply the class `transcript-text` or `prose` to the container.
- **Fluid Zoom**: Update `apps/lite/src/store/themeStore.ts`. When zoom changes, update `--reading-font-size` on the root container.
  - Formula: `baseSize * zoomScale` (e.g. `16px * 1.2`).
- **Constraint**: Ensure no `text-overflow: ellipsis` cuts off text. Every word must be visible.

## 4. Refine Highlights
- **Target**: `apps/lite/src/index.css` -> `::highlight(lookup-highlight)`.
- **Action**: Change background to a more subtle tint (e.g., `hsla(var(--primary), 0.1)`) and ensure the text color remains legible.

## 5. Verification
- **Test**: Set theme to Sepia. Zoom in 200%.
- **Check**: Text should be razor-sharp (font-size scaling), not blurry (transform scaling). Line height should feel "airy".

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/typography.mdx`.
- Update `apps/docs/content/docs/general/design-system/index.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Readio Worker (Coder)
- **Date**: 2026-01-25
- **Reviewed by**: Readio Reviewer (QA)
- **Commands**:
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite lint`
