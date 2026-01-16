> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Setup Standard Dependencies

## Objective
Install approved utility libraries and ensure project configuration matches the Vibe Charter. This is the foundational step for Phase 1.

## 1. Install `date-fns`
We have officially adopted `date-fns` for all date manipulation and formatting to replace brittle manual logic.
- **Action**: Run the following command from the root:
  ```bash
  pnpm --filter @readio/lite add date-fns
  ```
- **Verify**: Ensure it appears in `apps/lite/package.json`.

## 2. Refactor Legacy Date Logic (Targeted)
The Constitution forbids manual date string parsing, but we must preserve our custom I18n keys (`dateDaysAgo`).
- **Target**: `apps/lite/src/lib/dateUtils.ts`.
- **Mandatory**: Replace the implementation of `formatDateStandard` (YYYY-MM-DD) with `date-fns/format`.
- **Optional**: You MAY refactor `formatRelativeTime` logic to use `date-fns` for *calculations* (e.g. `differenceInDays`), but you **MUST preserve** the return of `t('key')` strings and `.toUpperCase()` formatting. Do NOT blindly replace it with `formatDistanceToNow` as that would break I18n.

## 3. Verify No Forbidden Libs
- **Action**: Check `apps/lite/package.json`.
- **Rule**: Ensure `lodash`, `underscore`, `moment` are NOT present. If found, remove them.

## 4. Verification & Quality Check
Since the `typecheck` script is not yet standardized (will be in Instruction 003), use direct commands:
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.
- **Logic Check**: Run `pnpm --filter @readio/lite test:run` (to verify logic without watch mode).

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.