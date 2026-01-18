> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Harden DevOps & Tooling [COMPLETED]

## Objective
Ensure the development environment is consistent across all machines (and Agents) by enforcing Node versions and standardizing scripts.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required.

## 1. Enforce Engines (`package.json`)
- **Action**: Add `engines` field to the **root** `package.json`.
  ```json
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=10.28.0"
  }
  ```
- **Why**: Prevents "Works on my machine" bugs caused by old Node versions.

## 2. Strict NPM Config (`.npmrc`)
- **Action**: Add `engine-strict=true` to `.npmrc`.
- **Why**: Makes `pnpm install` fail immediately if the Node version is wrong.

## 3. Standardize Scripts (`apps/lite/package.json`)
> **Note**: The `typecheck` script was already added during Instruction 001. Verify it exists; if so, skip this step.

- **Action**: Add `"typecheck": "tsc --noEmit"` (if missing).
- **Why**: Allows running type checking in CI without waiting for a full Vite build.
- **Turbo Sync**: Add the task to the root `turbo.json` so `pnpm typecheck` works from root:
  ```json
  "typecheck": {
    "dependsOn": ["^typecheck"],
    "cache": true
  }
  ```
- **Review**: Ensure `lint` (check) and `format` (write) scripts are consistent with the Biome configuration. Do not introduce a duplicate `fix` script if `format` already exists.

## 4. Verification
- **Test**: Run `pnpm --filter @readio/lite typecheck`. It should pass.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite exec tsc --noEmit`.
- **Lint**: Run `pnpm --filter @readio/lite exec biome check .`.

---
## Completion
- **Completed by**: Readio Worker (Coder)
- **Reviewed by**: Readio Reviewer (QA)
- **Commands**: 
  - `pnpm --filter @readio/lite typecheck`
  - `pnpm --filter @readio/lite exec biome check .`
  - `pnpm --filter @readio/lite build`
- **Date**: 2026-01-19
