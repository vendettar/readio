> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Prepare Standard Libraries (Phase 1 Final) [COMPLETED]

## Objective
One-time installation of all approved industry-standard libraries selected during the audit. This ensures the workspace is ready for Phase 2-5 refactors.

## 1. Batch Install
Run the following from root:
```bash
pnpm --filter @readio/lite add i18next react-i18next i18next-browser-languagedetector \
react-hook-form zod @hookform/resolvers \
react-dropzone \
sonner \
framer-motion \
react-hotkeys-hook @use-gesture/react
```

## 2. Cleanup Legacy Deps
If any of these exist, remove them:
```bash
pnpm --filter @readio/lite remove @radix-ui/react-toast
```

> **Note**: The `@radix-ui/react-toast` removal was reverted because the existing Toast implementation still depends on it. The migration to Sonner will be handled in a future instruction.

## 3. Verify
- Run `pnpm --filter @readio/lite build`.
- Ensure `apps/lite/package.json` reflects the new libraries.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.


---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` (dependency baseline).
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx` if new libs affect UI patterns.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Readio Worker (Coder)
- **Libraries Installed**:
  - `i18next` ^25.7.4
  - `react-i18next` ^16.5.3
  - `i18next-browser-languagedetector` ^8.2.0
  - `react-hook-form` ^7.71.1
  - `@hookform/resolvers` ^5.2.2
  - `zod` (already present)
  - `react-dropzone` ^14.3.8
  - `sonner` ^2.0.7
  - `framer-motion` ^12.27.0
  - `react-hotkeys-hook` ^5.2.3
  - `@use-gesture/react` ^10.3.1
- **Commands**:
  - `pnpm --filter @readio/lite build`
  - `pnpm --filter @readio/lite exec tsc --noEmit`
  - `pnpm --filter @readio/lite exec biome check .`
- **Date**: 2026-01-19
- **Reviewed by**: Readio Reviewer (QA)
