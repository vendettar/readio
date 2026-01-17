> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Legal Pages

## Objective
Add Privacy Policy and Terms of Service pages for production compliance. Provide routes and a Settings entry point.

## 1. Add Routes
- **Routes**:
  - `/legal/privacy`
  - `/legal/terms`
- **Files**: Create route files under `apps/lite/src/routes/legal/`.

## 2. Page Content
- **Action**: Add static template content for both pages.
- **Scope**: Include sections for data collection, storage, offline behavior, third-party services, and contact.
- **Language**: English first. If i18n is in place, wrap headings and paragraphs with `t()` and add keys.

## 3. Settings Entry
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx`.
- **Action**: Add a "Legal" section linking to Privacy Policy and Terms.

## 4. Verification
- **Test**: Navigate to `/legal/privacy` and `/legal/terms`.
- **Check**: Links from Settings work and pages render without layout shifts.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/routing.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D006 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
