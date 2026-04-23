> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement App Boot Sequence [COMPLETED]

## Objective
The app currently flashes "empty" content before Dexie hydrates. We need a "Boot Loader" that shows the Logo while `useAppInitialization` runs.

## 1. Create `BootLoader.tsx`
- **Path**: `apps/lite/src/components/AppShell/BootLoader.tsx`.
- **UI**:
  - Centered `readio.svg` (Logo).
  - Simple "Breathing" animation (opacity 0.5 <-> 1).

## 2. Integrate in Root
- **Target**: `apps/lite/src/routes/__root.tsx`.
- **Logic**:
  - Subscribe to `useAppInitialization` state (`isHydrated`, `isReady`).
  - Render:
    ```tsx
    <AnimatePresence>
      {!isReady && (
        <BootLoader key="boot" />
      )}
    </AnimatePresence>
    ```
- **Constraint**: The `BootLoader` should cover the screen using `fixed inset-0 z-50 bg-background`.

## 3. Verification
- **Test**: Refresh the page.
- **Check**: You should see the Logo breathe until data is ready, then fade out.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Commands**: 
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite lint`
- **Completed by**: Antigravity
- **Reviewed by**: NULLIUS
- **Date**: 2026-01-26

## Patch Additions (Integrated)
# Patch: 024-implement-app-boot-sequence

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
- No blocking network calls on initial render.
