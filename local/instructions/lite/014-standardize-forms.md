> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Standardize Forms (Zod + Hook Form)

## Objective
Replace uncontrolled inputs and manual validation with `react-hook-form` + `zod`. This applies mainly to the "Settings" page and any future input forms.

## 1. Create Schemas (`apps/lite/src/lib/schemas/settings.ts`)
- **Action**: Define Zod schemas for user settings (e.g., Theme, Language, Proxy).
  ```ts
  export const settingsSchema = z.object({
    theme: z.enum(['light', 'dark', 'system']),
    proxyUrl: z.string().url().optional().or(z.literal('')),
    // ...
  });
  ```

## 2. Refactor Settings Page
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx`.
- **Action**: Implement `useForm<Settings>({ resolver: zodResolver(settingsSchema) })`.
- **UI**: Use Shadcn `Form` components (`FormItem`, `FormControl`, `FormMessage`).

## 3. Persistence
- **Action**: When form submits (or auto-saves), save values using `apps/lite/src/lib/storage.ts`.
- **Constraint**: Do NOT use `localStorage.setItem` directly. Use the centralized helper to ensure key consistency.

## 4. Verify
- **Test**: Enter invalid Proxy URL. Ensure error message appears.
- **Test**: Reload page. Settings should persist.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.