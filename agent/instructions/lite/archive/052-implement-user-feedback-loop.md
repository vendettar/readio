> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/index.mdx` before starting.

# Task: Implement User Feedback Loop

## Objective
Establish a direct channel for users to report bugs or suggest features without leaving the application.

## 1. Create Feedback Section
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx`.
- **UI**: Add a "Community & Support" section.
- **Links**:
  - "Report a Bug" (Links to GitHub Issues with a pre-filled template).
  - "Support Email" (Links to `mailto:`).
 - **Rule**: Use `openExternal` for external links; do not inline `window.open`.

## 2. Feedback Context
- **Feature**: When the user clicks "Report a Bug", attempt to include the current App Version and OS info in the URL parameters for the GitHub issue.
 - **Privacy**: Do NOT include PII or file names in the URL.

## 3. I18n
- **Keys**: `settings.feedbackTitle`, `settings.reportBug`, `settings.contactSupport`.

## 4. Verification
- **Test**: Click "Report a Bug".
- **Check**: Verify the browser opens GitHub with the correct template and environment metadata.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/general/improvement-process.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D015 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
