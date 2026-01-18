> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx` before starting.

# Task: Implement Proxy Failover Mechanism

## Objective
Ensure the app remains functional even if the primary CORS proxy fails or is rate-limited.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Configure Proxy List
- **Target**: `apps/lite/src/lib/runtimeConfig.ts`.
- **Action**: Support an array of `CORS_PROXIES`.
- **Default**: Provide at least 2 distinct trusted proxy URLs.
 - **Rule**: Use `src/lib/storage.ts` to persist the last known working proxy.

## 2. Failover Logic
- **Target**: `apps/lite/src/lib/fetchUtils.ts`.
- **Action**: Wrap `fetchWithFallback`.
- **Behavior**:
  - If a request returns `429` (Too Many Requests) or `503` (Service Unavailable), increment the proxy index and retry immediately.
  - If a request returns `5xx` or network error, attempt the next proxy (max 2 retries).
  - Persist the "last known working proxy" using `storage.ts` to avoid retrying dead proxies on next boot.

## 3. Proxy Privacy Warning
- **Rule**: When a public proxy is active, display a clear disclosure in Settings and a non-blocking in-app notice (toast or banner).
- **Toggle**: Provide a user-facing toggle to disable public proxies (fallback to direct-only).
- **I18n**: Add keys for the disclosure and toggle label.

## 4. Verification
- **Test**: Simulate a 500 error on the primary proxy using MSW.
- **Check**: The app should silently retry via the secondary proxy without user intervention.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (External dependencies section).
- Update `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx` (Proxy fallback behavior).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D025 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
