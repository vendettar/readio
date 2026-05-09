# 142: Frontend Hook Unification (View Density & Debounce) [COMPLETED]

## Objective
Reduce code duplication by extracting shared logic for view density persistence and value debouncing into reusable hooks.

## Context
`ViewDensity` persistence logic is repeated in `DownloadsPage`, `FilesFolderPage`, and `FilesIndexPage`. `useDebouncedValue` is locally defined in both `useDiscoverySearch` and `useLocalSearch`.

## Proposed Changes

### 1. Create `apps/cloud-ui/src/hooks/useViewDensity.ts`
- Implement a hook `useViewDensity(storageKey: string, defaultDensity: ViewDensity = 'comfortable')`.
- Handles `useState` initialization and hydration from `getSetting`.
- Provides an `onDensityChange` callback that updates both state and `setSetting`.

### 2. Create `apps/cloud-ui/src/hooks/useDebouncedValue.ts`
- Move the existing `useDebouncedValue` implementation from `useDiscoverySearch.ts` to this new file.
- Export as `export function useDebouncedValue<T>(value: T, delayMs: number): T`.

### 3. Refactor Consumers
- **`apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`**: Use `useViewDensity('downloads.viewDensity')`.
- **`apps/cloud-ui/src/routeComponents/files/FilesFolderPage.tsx`**: Use `useViewDensity('files.viewDensity')`.
- **`apps/cloud-ui/src/routeComponents/files/FilesIndexPage.tsx`**: Use `useViewDensity('files.viewDensity')`.
- **`apps/cloud-ui/src/hooks/useDiscoverySearch.ts`**: Remove local `useDebouncedValue` and import from the new file.
- **`apps/cloud-ui/src/hooks/useLocalSearch.ts`**: Remove local `useDebouncedValue` and import from the new file.

## Affected Modules
- `apps/cloud-ui/src/hooks/useViewDensity.ts` (New)
- `apps/cloud-ui/src/hooks/useDebouncedValue.ts` (New)
- `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
- `apps/cloud-ui/src/routeComponents/files/FilesFolderPage.tsx`
- `apps/cloud-ui/src/routeComponents/files/FilesIndexPage.tsx`
- `apps/cloud-ui/src/hooks/useDiscoverySearch.ts`
- `apps/cloud-ui/src/hooks/useLocalSearch.ts`

## Verification & Testing
- **Lint & Typecheck**: `pnpm --filter @readio/cloud-ui lint` and `pnpm --filter @readio/cloud-ui typecheck`.
- **Behavioral Assertion**:
  - Verify that switching density on Files and Downloads pages still persists across reloads.
  - Verify that search (local and discovery) still functions with the expected debounce delay.

## Completion Section
- **Completed by**: Codex
- **Commands**: `pnpm -C apps/cloud-ui lint`; `pnpm -C apps/cloud-ui typecheck`
- **Date**: 2026-05-09
- **Reviewed by**: Codex
