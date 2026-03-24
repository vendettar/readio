# Task: Use `countryAtSave` for Library Detail Routing (Subscription/Favorite/History) [COMPLETED]

## Objective
Ensure country switching only affects discovery flows, not saved-library detail resolution.

For items in `Subscriptions`, `Favorites`, and `History`, detail requests must prefer the country captured at save time (`countryAtSave`) instead of the current global country.

## Product Decision (Fixed)
- Discovery (`Explore/Search/Top`) uses global `useExploreStore.country`.
- Library (`Subscriptions/Favorites/History`) uses `countryAtSave` for lookup metadata requests.
- Identity routing remains identity-first (`feedUrl`, `providerPodcastId`, `episodeId`, `providerEpisodeId`, `audioUrl`), not country-first.
- **No migration/backfill scripts** (first-release policy). Runtime fallback for missing `countryAtSave` is allowed.

## Scope Scan (Required)
- Config: no new env keys.
- Persistence: add `countryAtSave` field to subscription/favorite/history records.
- Routing: no new routes.
- Logging: no extra telemetry required.
- Network: change lookup request country source for library entry points.
- Storage: Dexie schema update allowed under first-release reset policy.
- UI state: no visible UI change required in this task.
- Tests: update store/hook behavior tests for country source priority.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Prevent resolver races where global country overwrites `countryAtSave` path on rapid navigation.
  - Ensure resolver reads consistent snapshots when favorites/subscriptions/history hydrate at different times.
- Hot-path performance:
  - Resolver must avoid full-table scans on each detail navigation.
  - Use indexed lookups / precomputed maps where possible for matching chains.
- State transition integrity:
  - Missing `countryAtSave` must degrade to deterministic fallback, never block navigation.
  - Multi-match tie-break must produce stable output across rerenders.
- Dynamic context consistency:
  - Library detail requests must stay bound to saved-country context.
  - Discovery global country changes must not mutate saved-item routing context.

## Implementation Steps (Execute in Order)
1. **Schema and Type Updates**
   - Update DB entity types to include `countryAtSave?: string`:
     - `Subscription`
     - `Favorite`
     - Playback session/history record used for episode reopening
   - Update Dexie schema/index definition as needed.
   - Keep country normalized to lowercase ISO code when writing.

2. **Write Path: Persist `countryAtSave`**
   - Subscription creation path (`exploreStore.subscribe`) writes `countryAtSave` from current store country.
   - Favorite creation path writes `countryAtSave` from current store country.
   - History/session write path (episode play/session persistence) writes `countryAtSave`.

3. **Read Path: Library Detail Country Source**
   - Apply deterministic priority for country source:
     - **Podcast detail opened from Subscriptions**: `subscription.countryAtSave` -> global/default.
     - **Episode detail opened from Favorites**: `favorite.countryAtSave` -> matching subscription `countryAtSave` (by `feedUrl`) -> global/default.
     - **Episode/detail opened from History**: `session.countryAtSave` -> matching favorite `countryAtSave` (by `episodeId` or `providerEpisodeId` then `audioUrl`) -> matching subscription `countryAtSave` (by `feedUrl`) -> global/default.
   - Multi-match tie-breakers (must be deterministic):
     - Prefer exact `providerEpisodeId` match over `episodeId` match, and `episodeId` over `audioUrl`.
     - If multiple records still match at the same level, select the record with latest `addedAt`/`lastPlayedAt` timestamp.
     - If timestamp is equal or missing, select lexicographically smallest stable primary key (`id`) as final tiebreaker.
   - Ensure this priority is implemented in one shared resolver/helper (avoid duplicated per-page logic).

4. **Resolution Strategy Guardrail**
   - Keep existing identity-first resolution.
   - `countryAtSave` only selects storefront/metadata context for lookup; it must not redefine entity identity.

5. **No Legacy Migration Work**
   - Do not implement backward migration scripts or bulk backfill jobs.
   - Do not add dedicated compatibility transforms for legacy vault/import records in this task.
   - If schema reset is needed in first-release mode, use existing reset approach.

6. **Documentation Sync**
   - Update:
     - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
     - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`
   - Document:
     - Discovery uses global country.
     - Library detail uses saved country.
     - No migration/backfill compatibility in this instruction; runtime fallback only (first-release policy).

## Acceptance Criteria
- Switching global country changes discovery results only.
- Previously saved subscription/favorite/history items resolve details using their own `countryAtSave`.
- No country-based misrouting when opening saved items after region switch.
- No legacy migration code introduced.

## Required Tests
- Store tests: write paths persist normalized `countryAtSave`.
- Detail-resolution tests: library entry points prefer saved country over global country.
- Fallback tests: missing `countryAtSave` uses global/default country.
- Tie-break stability tests (required):
  - same-level multi-match in favorites/sessions/subscriptions returns deterministic result.
  - timestamp missing/equal scenario still resolves deterministically via stable `id` lexicographic tiebreaker.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/db/types.ts`
  - `apps/lite/src/lib/dexieDb.ts`
  - `apps/lite/src/store/exploreStore.ts` (subscription/favorite write paths)
  - history/session write paths in player/session hooks/stores
  - library entry detail resolvers/pages for Subscriptions/Favorites/History
  - Docs:
    - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
    - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
    - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`
- Regression risks:
  - Inconsistent country source across different library entry points.
  - Non-deterministic record selection when multiple matches exist.
  - Missing `countryAtSave` writes in one or more save paths.
- Required verification:
  - Unit tests for resolver priority and tie-break behavior.
  - Integration tests for subscription/favorite/history open-detail flows after region switch.
  - Schema/type tests compile with new optional field usage.

## Constraints
- Forbidden:
  - Using global country directly for saved-item detail lookup when `countryAtSave` exists.
  - Introducing migration/compat layers for old data in this task.
  - Adding UI controls in this instruction.
- Required patterns:
  - Zustand atomic selectors.
  - Identity-first resolution, country-as-context only.

## Decision Log
- Required: Yes.
- Record this data-model and routing decision in:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint` (fails on pre-existing formatting issue in `src/lib/fetchUtils.ts`)
  - `pnpm -C apps/lite typecheck` (pass)
  - `pnpm -C apps/lite test:run` (pass)
- Date: 2026-02-08
