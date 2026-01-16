> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Implement Offline Mode

## Objective
Detect network status and degrade gracefully. The app is "Offline First", so local files must work perfectly without net.

## 1. Network Hook
- **Action**: Create `apps/lite/src/hooks/useNetworkStatus.ts`.
- **Implementation**: Listen to `window.addEventListener('online'/'offline')`.
- **Return**: `{ isOnline: boolean }`.

## 2. UI Feedback
- **Target**: `apps/lite/src/components/AppShell/Sidebar.tsx`.
- **Action**: If `!isOnline`, render a `WifiOff` icon (from Lucide) next to the logo.
- **Tooltip**: `t('offline.badge')` ("Offline Mode - Only local files available").

## 3. Disable Remote Features
- **Target**: `apps/lite/src/routeComponents/ExplorePage.tsx` and `CommandPalette.tsx`.
- **Action**: If `!isOnline`, completely **hide** the "Top Charts" section and the "Remote Results" group in Command Palette. Do not show an empty state, just collapse the section to focus on local content.

## 4. Error Handling
- **Target**: `apps/lite/src/lib/fetchUtils.ts` (or query client).
- **Action**: If a fetch fails due to network, ensure it throws a specific `NetworkError`.
- **UI**: Catch this error and show `t('offline.error')` ("No internet connection") via toast.

## 5. Verification
- **Test**: Go Offline (DevTools -> Network -> Offline).
- **Check**: Sidebar shows WifiOff icon. Explore page hides charts. Local files still play.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
