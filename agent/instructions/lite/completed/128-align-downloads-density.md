# Instruction 128: Align Downloads Density [COMPLETED]

## Status
- [ ] Active
- [x] Completed

## Hard Dependencies
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`

## Goal
Align `DownloadsPage` visual density and card spacing with `FilesPage` so library-style pages share one interaction and spacing model.

## Product Decisions (Locked)
1. Reuse existing density model (`comfortable` / `compact`) instead of introducing a Downloads-only variant.
2. Persist Downloads density preference via existing app store path (`downloads.viewDensity`).
3. Keep behavior-only scope: no routing, data model, or backend changes.

## Affected Modules
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- `apps/lite/src/components/Downloads/DownloadTrackCard.tsx`

## Scope Scan (8 Scopes)
- Config:
  - No new runtime config key.
- Persistence:
  - User UI preference persistence only (`downloads.viewDensity`).
- Routing:
  - No route or navigation behavior change.
- Logging:
  - No logging contract change.
- Network:
  - No network behavior change.
- Storage:
  - Local UI-preference storage path reused.
- UI state:
  - Density state wiring added to Downloads page/component tree.
- Tests:
  - Regression risk is visual/interaction drift; lint and typecheck gates required.

## Hidden Risk Sweep
- Async control flow:
  - None expected (state is local + store-backed preference).
- Hot-path performance:
  - Avoid extra re-renders by passing stable density props and using existing component variants.

## State Transition Integrity
1. Switching density must not break download card action affordances.
2. Density preference restore must not block normal page rendering on first load.

## Dynamic Context Consistency
1. Density UI must react to setting updates without stale memoized class mapping.
2. Shared density type usage across Files/Downloads must remain source-of-truth aligned.

## Implementation Summary
1. Type integration:
  - Reuse/import `ViewDensity` for Downloads components.
2. Component update:
  - `DownloadTrackCard` accepts `density` prop and applies CVA variants.
3. Page state and persistence:
  - `DownloadsPage` resolves density state and persists with `downloads.viewDensity`.
4. UI alignment:
  - `ViewControlsBar` added to Downloads header.
  - Container gap follows density:
    - `comfortable` => `gap-4` (16px)
    - `compact` => `gap-2` (8px)

## Acceptance Criteria
1. Downloads page exposes same density controls as Files page.
2. Density switch updates card spacing and card density variants consistently.
3. Density preference persists and restores across reloads.
4. No regression in download card actions or list rendering.

## Impact Checklist
- Affected modules:
  - `DownloadsPage` layout and density controls.
  - `DownloadTrackCard` density variant wiring.
- Regression risks:
  - Visual mismatch with Files page.
  - Preference persistence key mismatch.
- Required verification:
  - Lint and typecheck pass.

## Verification Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`

## Verification Results
- Lint: `pnpm --filter @readio/lite lint` (Passed with automated formatting)
- Typecheck: `pnpm --filter @readio/lite typecheck` (Passed)

## Decision Log
- Required: Waived (standardization task, no architectural authority change).

## Bilingual Sync
- Not applicable.

## Completion
- Completed by: Antigravity (Architect mode)
- Commands: `pnpm --filter @readio/lite lint`, `pnpm --filter @readio/lite typecheck`
- Date: 2026-03-01
- Reviewed by: Antigravity
