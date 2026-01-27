> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/security.mdx` before starting.

# Task: Security Hardened Iframe Sandbox

## Objective
If the application needs to render complex third-party HTML (e.g., specific podcast show-notes or widgets), ensure it is isolated.

## 1. Sandbox Utility Component
- **Path**: `apps/lite/src/components/ui/safe-iframe.tsx`.
- **Action**: Create a wrapper for `<iframe>`.
- **Requirement**: Apply the `sandbox` attribute strictly:
  - Default: `sandbox=""` (no allowances).
  - `allow-scripts` only if explicitly required and documented.
  - Do NOT allow `allow-same-origin` (prevents access to IndexedDB/LocalStorage).
  - Do NOT allow `allow-forms` or `allow-popups` unless explicitly needed.

## 2. Refactor External Rendering
- **Action**: Audit `PodcastEpisodeDetailPage.tsx` or any RSS description area.
- **Decision**: If the content is simple text, keep `DOMPurify`. If it contains complex embedded widgets, use `<SafeIframe />`.
- **Default**: Prefer `DOMPurify` and do NOT introduce iframes unless a concrete widget/embed requirement is confirmed.

## 3. Verification
- **Test**: Attempt to access `window.parent.localStorage` from inside the iframe.
- **Check**: The browser should block the request due to sandbox restrictions.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/security.mdx` (Sandbox policy).
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D014 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
