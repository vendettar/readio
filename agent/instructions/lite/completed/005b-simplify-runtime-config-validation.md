> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` and `apps/docs/content/docs/apps/lite/coding-standards/index.mdx` before starting.

# Task: Simplify Runtime Config Validation (Zod Coercion)

## Objective
Fix boolean parsing and mock flag handling in `runtimeConfig.ts` to prevent `"false"` string values from being treated as truthy, while preserving current behavior for all other fields.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Required (documentation updates).

## Steps
1. Update `apps/lite/src/lib/runtimeConfig.ts` to fix boolean parsing:
   - Replace `z.coerce.boolean()` with `z.preprocess` for `CORS_PROXY_PRIMARY` and `USE_MOCK_DATA`.
   - Accept values: `true/false`, `"true"/"false"`, `"1"/"0"`, `1/0`. Everything else falls back to default `false`.
2. Fix `USE_MOCK_DATA` mapping to avoid string truthiness:
   - Keep `import.meta.env.VITE_USE_MOCK_DATA === 'true'` as a hard override.
   - For `window.__READIO_ENV__`, pass the raw `READIO_USE_MOCK` value into schema preprocessing (do **not** `||` with it).
3. Keep existing numeric and string coercion/defaults intact; do not alter non-boolean field behavior.
4. Ensure `getAppConfig()` still returns a fully-populated `AppConfig` with defaults applied.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` with a short note that runtime config uses Zod coercion/defaults as the SSOT.
- Update `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx` with the same note.
- Update `apps/docs/content/docs/general/technical-roadmap.mdx` after review (add 005b completion line).
- Update `apps/docs/content/docs/general/technical-roadmap.zh.mdx` after review.
