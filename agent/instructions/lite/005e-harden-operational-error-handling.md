> **⚠️ CRITICAL**: Preserve current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/debugging.mdx` before starting.

# Task: Harden Operational Error Handling and Logging [COMPLETED]

## Objective
Eliminate silent failures and align operational error handling with the debugging standard:
- Prevent UI state desync when `audio.play()` fails.
- Log subscription action failures with context (while keeping user-facing toasts).
- Reduce production error noise for clipboard failures.
- Add low-noise diagnostics for recommendation feed validation failures.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Not applicable.

## Impact Checklist
- **Affected modules**: `apps/lite/src/routes/__root.tsx`, `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`, `apps/lite/src/hooks/selection/useSelectionActions.ts`, `apps/lite/src/lib/recommended/validator.ts`
- **Regression risks**: Playback state drift, log noise in prod, missed diagnostics for fetch failures.
- **Required verification**: `pnpm --filter @readio/lite exec tsc --noEmit`, `pnpm --filter @readio/lite exec biome check .`

## Required Patterns
- Use `src/lib/logger.ts` (`warn`/`logError`) for diagnostics; no raw `console.*`.
- Treat autoplay/clipboard failures as operational errors (non-fatal).
- Keep error handling side-effect free and avoid UI changes.

## Forbidden Dependencies
- No new dependencies or telemetry libraries.

## Steps
1. **Sync playback state on `play()` failure** (`apps/lite/src/routes/__root.tsx`):
   - Replace the empty `.catch(() => {})` with a handler that:
     - Logs a DEV-only warning via `warn` (include error + `audioUrl` when present).
     - Calls `usePlayerStore.getState().pause()` (or equivalent) to keep state aligned with the element.
2. **Add contextual logging for subscribe/unsubscribe failures** (`apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`):
   - In `handleSubscribe` catch block, log via `logError` with `podcast.id`, `podcast.feedUrl`, and the intended action (`subscribe`/`unsubscribe`).
   - Keep the existing toast behavior unchanged.
3. **Reduce clipboard error noise** (`apps/lite/src/hooks/selection/useSelectionActions.ts`):
   - Replace `navigator.clipboard.writeText(...).catch(logError)` with a DEV-only `warn` (or a silent no-op) to avoid production error spam for expected permission failures.
4. **Add low-noise diagnostics for feed validation** (`apps/lite/src/lib/recommended/validator.ts`):
   - In the outer `catch`, add a DEV-only `warn` that includes `feedUrl` and `country`.
   - Keep the return value unchanged (`false`) to preserve current behavior.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- No doc updates required.

## Completion
- **Completed by**: Antigravity (Execution Engine)
- **Commands**: `pnpm --filter @readio/lite exec tsc --noEmit && pnpm --filter @readio/lite exec biome check .`
- **Date**: 2026-01-20
