> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement App Boot Sequence

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
