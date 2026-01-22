> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Install Sonner (Toast)[COMPLETED]

## Objective
Replace the custom Radix UI Toast implementation with **Sonner**.
Sonner provides a better DX, better stacking, and promise support.

## 1. Dependencies
- **Install**: `sonner`.
- **Remove**: `@radix-ui/react-toast`.

## 2. Setup Provider (`apps/lite/src/routes/__root.tsx`)
- **Remove Legacy**: `import { ToastContainer } from '../components/Toast'` and remove `<ToastContainer />`.
- **Action**: Add `<Toaster />` from `sonner` at the root level.
- **Config**: Use `richColors` and `position="bottom-right"`.
  ```tsx
  import { Toaster } from 'sonner'
  // ...
  <Toaster richColors position="bottom-right" />
  ```

## 3. Create Wrapper (`apps/lite/src/lib/toast.ts`)
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
- **Compatibility**: Preserve `toast.*Key` helpers. Key → text conversion MUST happen inside `src/lib/toast.ts` via `i18next.t` or `translate()`; call sites should not translate manually.

## 4. Replace Usages
- **Search**: `useToast`, `toast(...)`.
- **Replace**: `import { toast } from '@/lib/toast'; toast.success(...)`.

## 5. Remove Legacy UI
- **Delete**: `apps/lite/src/components/Toast/ToastContainer.tsx` (Radix implementation).
- **Delete**: `apps/lite/src/components/Toast` directory (if empty).
- **Check**: `rg "@radix-ui/react-toast" apps/lite/src` returns zero results.

## 6. Verification
- **Check**: Run `pnpm --filter @readio/lite build` to ensure no component was directly importing Radix Toast.
- **Test**: Trigger an action (e.g., Save Settings). A beautiful toast should appear.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Completion
- **Date**: 2026-01-22
- **Commands**:
  - `pnpm --filter @readio/lite remove @radix-ui/react-toast`
- **Key Changes**:
  - Replaced Radix Toast with Sonner in `__root.tsx`.
  - Rewrote `src/lib/toast.ts` as a Sonner wrapper with i18n support.
  - Refactored all call sites to use `toast.*Key` helpers, ensuring 100% decoupling between UI components and translation logic for toasts.
  - Removed legacy `src/components/Toast` directory.
  - Updated English and Chinese documentation (`standards.mdx`, `shell.mdx`, `handoff/index.mdx`).
- **Verification**:
  - `pnpm --filter @readio/lite typecheck`: PASSED
  - `pnpm --filter @readio/lite lint`: PASSED
