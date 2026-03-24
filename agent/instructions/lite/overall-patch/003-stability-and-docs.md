# Instruction C: P1/P2 Stability + Docs Sync

## Scope
- `apps/lite/src/components/**`
- `apps/lite/scripts/**`
- Docs: `apps/docs/content/docs/general/design-system/index.mdx`, `apps/docs/content/docs/apps/lite/handoff/standards(.zh).mdx`

## Must Fix (P1)
1) `RootErrorBoundary`:
   - Replace `bg-foreground/[0.06]` with tokenized opacity.

2) `enforce-selectors.sh`:
   - Make failure robust (use `set -euo pipefail`, prefer `rg`).
   - Ensure the script is wired into CI (must fail CI on violation).

3) `FileDropZone` i18n:
   - Remove `as TranslationKey` casts.
   - Use explicit key map with fallback key.

## Optional (P2)
- Reduce `[&_*]` style selectors in `command.tsx`.
- Replace static `w-[calc(...)]` in Explore skeleton/carousel with tokens.

## Docs (Result State Only)
- `design-system/index.mdx`: z-index tokens, prose-isolate whitelist, allowed inline-style scenarios.
- `handoff/standards(.zh).mdx`: z-index token rule, ban static arbitrary values, allowed dynamic var cases.

## Acceptance
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`
