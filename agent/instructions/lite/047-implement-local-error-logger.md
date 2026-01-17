> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/index.mdx` and `apps/docs/content/docs/apps/lite/handoff/database.mdx` before starting.

# Task: Implement Local Error Logger

## Objective
Allow users to export technical logs to assist in debugging, as PWA environments are otherwise "black boxes" for developers.

## 1. Create Logger Utility
- **Path**: `apps/lite/src/lib/logger.ts`.
- **Implementation**:
  - Maintain an in-memory buffer of the last 100 log entries (Errors, Warnings).
  - Format: `[{ timestamp, level, message, stack? }]`.
- **Global Catch**: Wrap the main entry point to capture unhandled promise rejections.
 - **Privacy Rule**: Do NOT log PII (file names, file paths, user queries). Redact before storing.

## 2. Export UI
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx`.
- **Action**: Add a "Diagnostic Tools" section.
- **Feature**: A "Download Debug Logs" button that generates a `.log` or `.json` file from the buffer and triggers a browser download.

## 3. I18n
- **Keys**: `settings.diagnosticsTitle`, `settings.downloadLogs`, `settings.logsEmpty`.

## 4. Verification
- **Test**: Trigger a deliberate console error. Click the download button.
- **Check**: Verify the error appears in the downloaded file.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/debugging.mdx` (Log export flow).
- Update `apps/docs/content/docs/general/security.mdx` (PII redaction rule).
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` (Error handling & Supportability).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
