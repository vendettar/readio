> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/debugging.mdx` before starting.

# Task: Replace Raw Console Logging in Production Code

## Objective
Remove raw `console.log` usage in production code and route logging through `src/lib/logger.ts` or DEV guards to comply with the debugging standard.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Not applicable.

## Steps
1. Update `apps/lite/src/hooks/useFilePlayback.ts`:
   - Replace `console.log` calls with `log` from `src/lib/logger.ts`, or guard them behind `import.meta.env.DEV`.
2. Confirm no other raw `console.log` calls exist in non-test source files.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- No doc updates required.
