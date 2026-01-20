> **⚠️ CRITICAL**: Preserve current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/standards.mdx` and `apps/docs/content/docs/apps/lite/coding-standards/index.mdx` before starting.

# Task: Harden Storage Defaults and Value Validation [COMPLETED]

## Objective
Normalize storage defaults and guard against corrupt localStorage values:
- Align non‑React translation default with global default (`en`).
- Validate/clamp persisted playback settings.
- Namespace language storage key to avoid collisions.

## Decision Log
- **Required / Waived**: Waived (no rule‑doc changes).

## Bilingual Sync
- **Required / Not applicable**: Not applicable.

## Impact Checklist
- **Affected modules**: `apps/lite/src/lib/i18nUtils.ts`, `apps/lite/src/hooks/useI18n.tsx`, `apps/lite/src/store/playerStore.ts`
- **Regression risks**: Language mismatch between hooks and utilities; corrupted localStorage values; cross‑app storage collisions.
- **Required verification**: `pnpm --filter @readio/lite exec tsc --noEmit`, `pnpm --filter @readio/lite exec biome check .`

## Required Patterns
- Use `storage.ts` helpers for all localStorage access.
- Keep defaults consistent with `runtimeConfig`.

## Forbidden Dependencies
- No new dependencies.

## Steps
1. **Align i18n default** (`apps/lite/src/lib/i18nUtils.ts`):
   - Replace hardcoded `'zh-CN'` fallback with `'en'` or `getAppConfig().DEFAULT_LANG` if available.
2. **Namespace the language key**:
   - Define a single shared constant (e.g., `STORAGE_KEY_LANGUAGE`) used in both `useI18n.tsx` and `i18nUtils.ts`.
   - Migrate reads to support legacy key `'language'` for backward compatibility (read legacy if new key missing, and write back to new key).
3. **Clamp persisted audio settings** (`apps/lite/src/store/playerStore.ts`):
   - When reading volume and playbackRate, validate numeric bounds (volume 0–1, playbackRate > 0 and reasonable max like 4).
   - When writing playbackRate, clamp to same bounds.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- No doc updates required.

## Completion
- **Completed by**: Antigravity (Execution Engine)
- **Commands**: `pnpm --filter @readio/lite exec tsc --noEmit && pnpm --filter @readio/lite exec biome check .`
- **Date**: 2026-01-20
- **Reviewed by**: Codex
