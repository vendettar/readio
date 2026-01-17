> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Accessibility Standards (Audit)

## Objective
Ensure Readio Lite is usable by everyone, including those using screen readers or keyboard-only navigation.

## 1. ARIA Labels
- **Action**: Audit all icon-only buttons (Play, Pause, Menu, Sidebar toggles).
- **Rule**: Every `<Button>` without visible text MUST have an `aria-label` or `title`.
- **I18n**: All ARIA labels must be localized using `t()`.

## 2. Keyboard Navigation
- **Action**: Verify the "Focus Ring" visibility across all interactive elements.
- **Rule**: Do NOT use `outline-none` unless replacing it with a custom visible focus state.
- **Check**: Use the `Tab` key to navigate the entire app. Ensure focus order is logical (Sidebar -> Content -> Player).

## 3. Contrast & Semantics
- **Rule**: Ensure all text meets WCAG AA contrast ratios (Standard in shadcn, but verify custom accent colors).
- **Semantics**: Use appropriate HTML tags (`<header>`, `<main>`, `<nav>`, `<h1>`-`<h3>`) instead of generic `<div>`s for structure.

## 4. Verification
- **Test**: Run the app and use MacOS "VoiceOver" or Chrome "Lighthouse" A11y audit.
- **Goal**: Score > 90 on Lighthouse A11y.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/accessibility.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
