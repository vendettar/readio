> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Prepare Standard Libraries (Phase 1 Final)

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
