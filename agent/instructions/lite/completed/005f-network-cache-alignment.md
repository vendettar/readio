> **⚠️ CRITICAL**: Preserve current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/data-fetching.mdx` and `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx` before starting.

# Task: Align Network Fetching and Cache Controls [COMPLETED]

## Objective
Align network fetching and caching behavior with documented standards:
- Dictionary lookup must use `fetchWithFallback` and timeouts.
- Concurrency limit must respect runtime config.
- Discovery query caching must match the handoff spec.

## Decision Log
- **Required / Waived**: Required (update discovery caching doc if behavior changes are justified or doc is corrected).

## Bilingual Sync
- **Required / Not applicable**: Required if any docs are updated.

## Impact Checklist
- **Affected modules**: `apps/lite/src/lib/selection/api.ts`, `apps/lite/src/lib/requestManager.ts`, `apps/lite/src/hooks/useDiscoveryPodcasts.ts`
- **Regression risks**: Network regressions under proxy fallback, too-aggressive request concurrency, stale discovery data.
- **Required verification**: `pnpm --filter @readio/lite exec tsc --noEmit`, `pnpm --filter @readio/lite exec biome check .`

## Required Patterns
- Use `fetchWithFallback` from `src/lib/fetchUtils.ts` for external network calls.
- Respect `MAX_CONCURRENT_REQUESTS` from `runtimeConfig`.
- Keep query caching consistent with `handoff/features/discovery.mdx`.

## Forbidden Dependencies
- No new dependencies.

## Steps
1. **Dictionary lookup uses fallback + timeout** (`apps/lite/src/lib/selection/api.ts`):
   - Replace direct `fetch` with `fetchWithFallback` or `fetchJsonWithFallback`.
   - Pass `signal` and keep Accept header semantics (if needed via `fetchWithFallback` wrapper).
   - Respect `TIMEOUT_MS` from `runtimeConfig` when configuring `fetchWithFallback`.
2. **Runtime‑configurable concurrency** (`apps/lite/src/lib/requestManager.ts`):
   - Replace hardcoded `MAX_CONCURRENT_REQUESTS = 6` with `getAppConfig().MAX_CONCURRENT_REQUESTS`.
   - Ensure this value is resolved once at module load (or add a function if hot‑reload is required).
3. **Discovery query caching alignment** (`apps/lite/src/hooks/useDiscoveryPodcasts.ts`):
   - Set `staleTime`/`gcTime` to match the handoff spec (6h/24h) unless the doc is updated with a justified change.
4. **Docs sync if needed**:
   - If cache durations remain different from the handoff spec, update `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx` and `.zh.mdx` to match actual values and rationale.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- Caching behavior aligned with `handoff/features/discovery.mdx`.
- No updates to documentation required as code now matches existing specification.

## Completion
- **Completed by**: Antigravity (Execution Engine)
- **Commands**: `pnpm --filter @readio/lite exec tsc --noEmit && pnpm --filter @readio/lite exec biome check .`
- **Date**: 2026-01-20
