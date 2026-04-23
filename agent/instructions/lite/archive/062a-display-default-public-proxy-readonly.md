> **⚠️ CRITICAL**: Preserve current UI/UX layout and styling. This task is a diagnostics UX improvement only.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` and `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx` before starting.

# Task: 062a — Display Default Public Proxy (Read-Only) in Settings [COMPLETED]

## Goal
Make the deployment-provided proxy URL observable to users for troubleshooting and transparency, without expanding the attack surface by allowing edits.
> **Status**: Superseded by the decision to remove proxy UI in Readio Lite (deployment-only configuration).

## Context
Proxy configuration (if any) is deployment-only via `READIO_CORS_PROXY_URL`. Runtime Settings no longer expose proxy controls in Readio Lite.

## Decision Log / Bilingual Sync
- **Decision Log**: Waived (read-only diagnostics UI).
- **Bilingual Sync**: Required (translations + docs).

## Strategy Defaults
- No optional branches. Implement a single read-only display using the existing SSOT config accessor.

## Hidden Risk Sweep
- **Do not mislead**: Clearly label the value as “deployment default / read-only”.
- **No new coupling**: Read directly from the existing config accessor (SSOT), not from duplicated constants.

---

## Requirements
1. Settings must show the current deployment proxy URL (from runtime config).
2. The field must be **read-only** (no editing, no persistence).
3. The display must not imply that runtime settings can edit proxy configuration.

---

## Implementation Steps (Coder)
1. **Add UI row in Settings → Proxy section**
   - Display label: “Deployment proxy (read-only)”
   - Value: current deployment proxy URL
   - If empty/unset: show “(not set)” or equivalent i18n string.
   - Optional: copy-to-clipboard button for convenience (only if you already have a reusable pattern).

2. **Source of truth**
   - Read from `getAppConfig()` (or whichever accessor currently provides `DEFAULT_CORS_PROXY`), not from `public/env.js` directly.

3. **i18n**
   - Add translation keys for:
     - label
     - “not set” placeholder
     - helper text (optional) explaining it comes from deployment config and cannot be edited here

4. **Docs**
   - Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` + `.zh.mdx`:
   - Mention that Settings displays the deployment proxy value for diagnostics.
     - Reiterate SSOT: deployment config (`env.js`) sets the default; Settings does not edit it.

---

## Verification
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`
- Manual check:
  - Change `READIO_CORS_PROXY_URL` in `apps/lite/public/env.js` (dev only), reload app, verify Settings reflects the new value.

## Completion
- **Completed by**: Codex
- **Commands**: not run (doc/status update only)
- **Date**: 2026-01-30
- **Reviewed by**: Codex
  
  When finished: append `[COMPLETED]` to the H1, fill Completion fields. Reviewer must add `Reviewed by` before Worker updates `technical-roadmap.mdx`.
