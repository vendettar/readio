> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Harden Audio Unit Tests [COMPLETED]

## Objective
The Audio Engine is the most complex part of the app. We need strict unit tests for the State Machine and Resource Management.

## 1. Setup Test Environment
- **Action**: Ensure `vitest` is configured with `jsdom` (already done in 001/005).
- **Mock**: Mock `URL.createObjectURL` and `URL.revokeObjectURL` in `apps/lite/src/__tests__/setup.ts`.

## 2. Test Player Store (`apps/lite/src/store/__tests__/playerStore.test.ts`)
- **Action**: Add tests for the `status` enum (`idle` -> `loading` -> `playing`).
- **Case**: "Play should be ignored if status is loading".
- **Case**: "Resource Management": Verify `loadAudioSource` (from Instruction 027) calls `revokeObjectURL` for the previous track.
- **Case**: "Autoplay Block":
  ```ts
  it('should revert to paused if autoplay is blocked', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'));
    await store.play();
    expect(store.status).toBe('paused');
  });
  ```

## 3. Test Feedback Loops
- **Target**: `GlobalAudioController`.
- **Action**: Render the component using `@testing-library/react`.
- **Logic**: Fire `timeupdate` on the hidden `<audio>` tag and verify `playerStore.progress` updates.

## 4. Verification
- **Test**: Run `pnpm --filter @readio/lite test:run`. All tests should pass.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/testing-guide.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Codex
- **Commands**: `pnpm --filter @readio/lite lint`, `pnpm --filter @readio/lite typecheck`, `pnpm --filter @readio/lite test:run`
- **Date**: 2026-01-27
- **Reviewed by**: Readio Reviewer (QA)

## Patch Additions (Integrated)
# Patch: 032-harden-audio-unit-tests

## Why
Content-level normalization to align with Leadership requirements and prevent execution drift.

## Global Additions
- Add Scope Scan (config, persistence, routing, logging, network, storage, UI state, tests).
- Add Hidden Risk Sweep for async control flow and hot-path performance.
- Add State Transition Integrity check.
- Add Dynamic Context Consistency check for locale/theme/timezone/permissions.
- Add Impact Checklist: affected modules, regression risks, required verification.
- Add Forbidden Dependencies / Required Patterns when touching architecture or cross-module refactors.

## Task-Specific Additions
- Define minimum test coverage thresholds.
