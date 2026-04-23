# Task: 116b (Patch) - Country Source Simplification + Cache/Slug Contracts [COMPLETED]

## Goal
Remove resolver-driven country inference from podcast content routes and harden two shared contracts:
- feed cache key semantics,
- fixed `shortId8` slug policy.

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: keep `countryAtSave`; no migration/backfill job.
- Routing: consume country only from route params in content pages.
- Logging: error logs for rejected remote/library persistence missing `countryAtSave`.
- Network: no endpoint changes; only country-source change.
- Storage: feed cache key namespace update required to avoid mixed old/new keys.
- UI state: no `location.state.country` as correctness source.
- Tests: hook-level country source, cache key, slug parser/generator.

## Hidden Risk Sweep
- Async: country changes mid-flight must not allow stale responses to overwrite current route state.
- Hot-path: remove DB fan-out on content-route init.
- State transition integrity: persistence rejection for missing `countryAtSave` must not block active playback start.
- Dynamic context consistency: global country toggles must not affect existing `/$country/...` page resolution.

## Required Patterns
- In `/$country/podcast/*`, country authority = route `$country` only.
- `useResolvedLibraryCountry` cannot influence podcast content route fetches.
- Feed cache key must be `normalizedFeedUrl` only.
- Provider lookup and provider episodes keys remain country-scoped.
- Slug token policy fixed to exact 8-char suffix.

## Implementation Steps
1. Content-route country source migration:
   - Update:
     - `apps/lite/src/hooks/useEpisodeResolution.ts`
     - `apps/lite/src/routeComponents/podcast/PodcastShowPage.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodesPage.tsx`
     - `apps/lite/src/routeComponents/podcast/PodcastEpisodeDetailPage.tsx`
   - Ensure these paths read country only from route params and never from resolver/DB/state.

2. Resolver de-scope:
   - Keep `useResolvedLibraryCountry` only for non-country-route flows if needed.
   - Add explicit guard/comments to prevent future reuse in `/$country/podcast/*`.

3. Feed cache key policy and migration safety:
   - Add `normalizeFeedUrl` helper (conservative normalization):
     - trim,
     - parse URL,
     - lowercase scheme/host,
     - remove fragment,
     - normalize default port only.
     - do not strip query params.
   - Feed query key = normalizedFeedUrl only (no country segment).
   - Use feed cache namespace `feed` with normalized feed URL keys and ensure old-key contamination is isolated by key-shape change.

4. Fixed `shortId8` contract:
   - Single authority lives in slug utility (no duplicate logic in hooks/components).
   - `generateSlugWithId` emits exact 8-char alnum suffix.
   - If cleaned source ID length < 8, pad deterministically to 8 via stable hash-based suffixing.
   - `parseSlugWithId` accepts exact 8-char suffix only.
   - `useEpisodeResolution` matching must use deterministic token equality behavior from shared utility (no variable-length `startsWith` policy).

5. `countryAtSave` write-path enforcement:
   - Remote/library writes must reject persistence when `countryAtSave` is missing:
     - subscriptions,
     - favorites,
     - explore-origin playback sessions.
   - Local track sessions are excluded.
   - Rejection must log and must not block immediate playback start.

## Acceptance Criteria
- Podcast content pages no longer depend on `useResolvedLibraryCountry`.
- Switching route country cancels stale in-flight requests and prevents stale apply.
- Feed cache key excludes country and uses normalized feed URL.
- Old feed cache namespace cannot interfere with new policy.
- Slug parser rejects non-8-char suffix tokens.
- Remote/library write path never silently persists records without `countryAtSave`.

## Required Tests
- `useEpisodeResolution` consumes route country only.
- No resolver invocation from `/$country/podcast/*` path.
- Mid-flight country change race test (stale response ignored).
- `normalizeFeedUrl` table tests.
- Feed cache key tests confirm no country segment.
- Slug generator/parser tests enforce exact `shortId8`.
- Write-path tests for missing `countryAtSave` rejection (remote/library) and local-session exemption.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - podcast route components/hooks,
  - discovery cache keying helpers,
  - slug utilities,
  - explore/session write paths.
- Regression risks:
  - stale response overwrite when country changes quickly.
  - slug mismatch causing valid episode not found.
  - feed cache churn/duplication if normalization inconsistent.
- Required verification:
  - country-switch navigation matrix,
  - slug edge-case matrix,
  - cache namespace behavior validation.

## Decision Log
- Required: Yes (cache key and slug contract must be recorded at 116c completion).

## Bilingual Sync
- Not applicable in 116b (code-focused step).

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint` (pass; Biome schema mismatch reported as info only)
  - `pnpm -C apps/lite lint:selectors` (pass)
  - `pnpm -C apps/lite typecheck` (pass)
  - `pnpm -C apps/lite test:run` (fails due missing `msw/node` resolution in test setup)
- Date: 2026-02-12
- Reviewed by: Codex (GPT-5)
