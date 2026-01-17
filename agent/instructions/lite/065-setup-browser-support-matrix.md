> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` before starting.

# Task: Setup Browser Support Matrix

## Objective
Ensure the app runs reliably on older devices and specific WebViews by configuring explicit target support and polyfills.

## 1. Configure Browserslist
- **Action**: Add a `.browserslistrc` file to the root or update `package.json`.
- **Target**: `> 0.5%, last 2 versions, not dead, iOS >= 14, Firefox ESR`.

## 2. Polyfill Strategy
- **Action**: Use `@vitejs/plugin-legacy` to generate chunks for older browsers.
- **Requirement**: Specifically polyfill `ResizeObserver`, `IntersectionObserver`, and `AbortController` if not supported by the matrix.
 - **Dependency**: Add `@vitejs/plugin-legacy` to `apps/lite/package.json` if missing.

## 3. Verification
- **Test**: Run `pnpm build`. Check `dist/` for legacy chunks.
- **Check**: Use BrowserStack or an old physical device (e.g., iPhone 8) to verify the app doesn't white-screen.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (Supported Browsers section).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D028 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
