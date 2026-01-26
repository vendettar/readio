> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Offline Mode [COMPLETED]

## Objective
Detect network status and degrade gracefully. The app is "Offline First", so local files must work perfectly without net.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Network Hook
- **Action**: Create `apps/lite/src/hooks/useNetworkStatus.ts`.
- **Implementation**: Listen to `window.addEventListener('online'/'offline')`.
- **Return**: `{ isOnline: boolean }`.

## 2. UI Feedback
- **Target**: `apps/lite/src/components/AppShell/Sidebar.tsx`.
- **Action**: If `!isOnline`, render a `WifiOff` icon (from Lucide) next to the logo.
- **Tooltip**: `t('offline.badge')` ("Offline Mode - Only local files available").
 - **I18n**: Add `offline.badge` and `offline.error` to `apps/lite/src/lib/translations.ts`.

## 3. Disable Remote Features
- **Target**: `apps/lite/src/routeComponents/ExplorePage.tsx` and `CommandPalette.tsx`.
- **Action**: If `!isOnline`, completely **hide** the "Top Charts" section and the "Remote Results" group in Command Palette. Do not show an empty state, just collapse the section to focus on local content.
 - **Local Entry**: Ensure a visible "Local Library" entry point remains (Subscriptions/Favorites/History/Files) so users see actionable offline content.

## 4. Error Handling
- **Target**: `apps/lite/src/lib/fetchUtils.ts` (or query client).
- **Action**: If a fetch fails due to network, ensure it throws a specific `NetworkError`.
- **UI**: Catch this error and show `t('offline.error')` ("No internet connection") via toast.
- **Network Jitter**: Debounce online/offline changes (e.g., 1–2s). Do not spam toasts on rapid flaps; show at most one error toast until state stabilizes.
- **Cache Miss**: If remote data is unavailable while offline, do not retry; keep UI in local-only mode without empty-state errors.

## 5. Verification
- **Test**: Go Offline (DevTools -> Network -> Offline).
- **Check**: Sidebar shows WifiOff icon. Explore page hides charts. Local files still play.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Antigravity
- **Date**: 2026-01-26
- **Status**: Completed

## Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`

## Reviewed by
- Antigravity
