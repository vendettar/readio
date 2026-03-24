# Task: 113 - Refactor GlobalAudioController Internals (Phase 1) [COMPLETED]

## Objective
Reduce `GlobalAudioController` complexity by extracting synchronization/event logic into focused hooks while preserving current behavior and public contracts.

## Product Decision (Fixed)
1. Phase 1 scope is internal extraction only.
2. Keep `GlobalAudioController` public behavior unchanged.
3. Add focused hooks:
   - `useAudioElementSync` (src/volume/playbackRate sync)
   - `useAudioElementEvents` (timeupdate/ended/error/waiting bindings)
4. Keep media-session integration path unchanged in this phase.
5. Keep autoplay retry semantics unchanged in this phase.
6. Defer media-session/autoplay structural changes to `113b`.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema/storage changes.
- Routing:
  - No route changes.
- Logging:
  - Preserve existing audio error logging semantics.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - No UI behavior changes.
- Tests:
  - Keep existing controller tests passing and add extracted-hook tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - maintain event binding/unbinding order and cleanup correctness.
- Hot-path performance:
  - avoid redundant listeners and repeated handler allocation.
- State transition integrity:
  - keep `loading/playing/paused/error` transitions identical.
- Dynamic context consistency:
  - audio source switches must still reapply volume/playbackRate and listener state.

## Implementation Steps (Execute in Order)
1. **Extract sync hook**
   - Add:
     - `apps/lite/src/hooks/useAudioElementSync.ts`
   - Required behavior:
     - sync `src`, `volume`, `playbackRate` to `audioRef`.
     - preserve current dependency timing semantics.

2. **Extract event hook**
   - Add:
     - `apps/lite/src/hooks/useAudioElementEvents.ts`
   - Required behavior:
     - encapsulate listener registration/cleanup.
     - preserve current event-to-store update semantics.

3. **Refactor GlobalAudioController to coordinator shell**
   - Update:
     - `apps/lite/src/components/AppShell/GlobalAudioController.tsx`
   - Required behavior:
     - controller coordinates hooks and renders `<audio>`.
     - no behavioral changes beyond internal organization.

4. **Docs sync (atomic)**
   - Update audio-engine/architecture docs to reflect hookized internal structure.

## Acceptance Criteria
- Existing playback/session/media-key behavior remains unchanged.
- `GlobalAudioController` complexity is reduced by internal extraction.
- No regressions in existing audio controller tests.

## Required Tests
1. Add:
   - `apps/lite/src/hooks/__tests__/useAudioElementSync.test.ts`
   - `apps/lite/src/hooks/__tests__/useAudioElementEvents.test.ts`
2. Keep existing:
   - `apps/lite/src/components/AppShell/__tests__/GlobalAudioController.test.tsx`

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useAudioElementSync.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useAudioElementEvents.test.ts`
- `pnpm -C apps/lite test:run -- src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec vitest run src/hooks/__tests__/useAudioElementSync.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/hooks/__tests__/useAudioElementEvents.test.tsx`
  - `pnpm -C apps/lite exec vitest run src/components/AppShell/__tests__/GlobalAudioController.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
