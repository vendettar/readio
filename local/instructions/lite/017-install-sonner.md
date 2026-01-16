> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Install Sonner (Toast)

## Objective
Replace the custom Radix UI Toast implementation with **Sonner**.
Sonner provides a better DX, better stacking, and promise support.

## 1. Setup Provider (`apps/lite/src/routes/__root.tsx`)
- **Remove Legacy**: `import { ToastContainer } from '../components/Toast'` and remove `<ToastContainer />`.
- **Action**: Add `<Toaster />` from `sonner` at the root level.
- **Config**: Use `richColors` and `position="bottom-right"`.
  ```tsx
  import { Toaster } from 'sonner'
  // ...
  <Toaster richColors position="bottom-right" />
  ```

## 2. Create Wrapper (`apps/lite/src/lib/toast.ts`)
- **Action**: Rewrite this file to wrap Sonner.
- **Why**: Allows us to swap the library later if needed without changing all call sites.
  ```ts
  import { toast as sonnerToast } from 'sonner'
  export const toast = {
    success: sonnerToast.success,
    error: sonnerToast.error,
    info: sonnerToast.info,
    warning: sonnerToast.warning,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
  }
  ```

## 3. Replace Usages
- **Search**: `useToast`, `toast(...)`.
- **Replace**: `import { toast } from '@/lib/toast'; toast.success(...)`.

## 4. Remove Legacy UI
- **Delete**: `apps/lite/src/components/Toast/ToastContainer.tsx` (Radix implementation).
- **Delete**: `apps/lite/src/components/Toast` directory (if empty).

## 5. Verification
- **Check**: Run `pnpm --filter @readio/lite build` to ensure no component was directly importing Radix Toast.
- **Test**: Trigger an action (e.g., Save Settings). A beautiful toast should appear.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.