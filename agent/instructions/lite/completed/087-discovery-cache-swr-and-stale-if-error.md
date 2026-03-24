# Task: 087 - Discovery Cache: SWR + Stale-if-Error with Extended localStorage TTL [COMPLETED]

## Objective
Improve Explore and Podcast detail data-cache behavior to prioritize continuity:
- Keep old cached data available even after TTL expiry.
- Revalidate in background when possible.
- Replace stale cache only when a newer request succeeds.
- Never degrade UX to "empty/no data" when stale data exists.

This instruction applies to discovery-related API results used by:
- Explore home modules
- Podcast show/detail flows that depend on iTunes lookup and episode lookup

## Product Decision (Fixed)
1. Cache read order must be:
   - memory (React Query / provider memory)
   - localStorage cache entry
   - network request
2. localStorage entries must **not** be deleted just because TTL elapsed.
3. Expired entries are treated as `stale`, not removed.
4. Cache replacement is write-on-success only (per-key default rule):
   - new network success -> overwrite cache
   - network failure -> keep and continue serving stale
5. Capacity eviction is a controlled exception, not a replacement path:
   - cross-key eviction is allowed only under bounded-capacity cleanup rules in Step 5
   - eviction must never violate stale-safe protection / hard-retention guarantees
6. Search APIs remain short TTL; chart/detail APIs use longer TTL.

## Scope Scan (Required)
- Config:
  - Add/adjust explicit TTL constants for discovery API groups.
  - Keep runtime-config override support where applicable.
- Persistence:
  - No Dexie schema changes.
  - localStorage cache envelope format remains backward-compatible.
- Routing:
  - No route changes.
- Logging:
  - Add debug-level logs for stale-hit/revalidate-success/revalidate-fail paths (no noisy user toasts).
- Network:
  - Revalidation must use existing deduped request pipeline.
- Storage:
  - No eager deletion on expiry.
  - Add bounded cleanup policy (capacity-based) to avoid unbounded localStorage growth.
- UI state:
  - If stale data exists, UI should render data first, not hard-empty loading/error.
- Tests:
  - Add/extend unit tests for stale retention, success-overwrite, and stale-if-error fallback.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Prevent duplicate revalidation storms from concurrent mounts/tabs.
  - Ensure stale-serving path cannot race and overwrite newer results with older payloads.
- Hot-path performance:
  - Avoid heavy JSON scans per render; parse/read cache only in query/provider functions.
  - Avoid blocking first paint on network when stale cache is present.
- State transition integrity:
  - Existing data state must not transition to action-blocking empty/error solely due to TTL expiry.
  - Preserve actionable UI (navigate/play/subscribe) when stale data is present.
- Dynamic context consistency:
  - Country-sensitive data must stay keyed by `country`.
  - No cross-country cache bleed.

## TTL Policy (Target)
Use these effective localStorage/provider TTLs:

1. **24h**
- `fetchTopPodcasts`
- `fetchTopEpisodes`
- `lookupPodcastsByIds` (Editor Picks source)
- `lookupPodcast`

2. **12h**
- `lookupPodcastEpisodes` (large episode list payload)

3. **30m (unchanged)**
- `searchPodcasts`
- `searchEpisodes`

4. **24h (unchanged)**
- `fetchPodcastFeed` parsed result cache (`feed-v2`)

## Implementation Steps (Execute in Order)
1. **Define explicit cache profiles**
   - In discovery provider/cache layer, define per-API TTL constants (do not rely on one generic 1h value for all APIs).
   - Keep names clear (e.g., `TTL_TOP_PODCASTS_MS`, `TTL_LOOKUP_PODCAST_MS`, etc.).

2. **Introduce stale-aware read contract**
   - Add a cache-read helper that returns status, not only data:
     - `fresh` | `stale` | `miss`
     - includes `data` and `ageMs` where available.
   - Do not remove stale entries during read.

3. **Implement SWR + stale-if-error behavior**
   - For applicable APIs:
     - On `fresh`: return cached data.
     - On `stale`: return stale data immediately, then trigger background revalidation.
     - On `miss`: request network and cache on success.
   - Background revalidation:
     - Must use existing request deduping (`requestManager`) to avoid duplicate inflight calls.
     - On success: overwrite memory + localStorage with new payload/timestamp.
     - On failure: keep stale cache unchanged.
   - **Current-page synchronization (required)**:
     - Revalidate success must also push fresh data to currently mounted UI/query state.
     - Fixed strategy for this instruction: use `queryClient.setQueryData` for the exact active query key.
     - `queryClient.invalidateQueries` is exception-only and allowed only when exact key mapping is impossible; any exception must be documented inline in code comments.
     - Acceptance is not met if cache updates but visible page remains stale until manual navigation.

4. **Preserve query/UI continuity**
   - Ensure hooks/pages do not collapse to empty state if stale data is available.
   - Keep existing retry/offline semantics; this change is cache semantics, not UI redesign.

5. **Bounded cleanup policy (non-expiry-based)**
   - Add capacity cleanup triggered only on successful writes (or explicit maintenance event), not on read-expiry.
   - Explicit maintenance event is limited to manual maintenance entry points only (for example, a user-triggered maintenance/cleanup action in Settings). Do not trigger it from background reads, app boot, or passive navigation.
   - Manual maintenance must be wired through a single trigger point (one exported action/function) to prevent accidental invocation drift across call sites.
   - Standardize this trigger as one exported function from discovery cache module (e.g., `runDiscoveryCacheMaintenance()`), and forbid direct cleanup invocation from other call sites.
   - Keep/extend existing provider memory cap.
   - Define hard-retention window explicitly:
     - `HARD_RETENTION_MS = max(API_TTL_MS * 4, 7 days)`
     - Example: for 24h TTL APIs, hard retention is 7 days; for 30m TTL APIs, hard retention is also 7 days.
   - Cleanup must be **stale-safe**:
     - Do not evict another key's only cached payload if it is still within the defined hard-retention window.
     - Prefer evicting entries already beyond hard-retention first.
   - If no evictable entry exists under these rules, skip new write instead of evicting protected fallback entries.
   - In this protected-capacity case, memory cache apply is still allowed (`applied=true`) while localStorage persistence can be skipped (`persisted=false`), so active page refresh remains valid.
   - Document deterministic eviction order for eligible entries and cover it in tests.

6. **Document cache semantics**
   - Update discovery handoff docs with:
     - read order
     - stale semantics
     - write-on-success replacement
     - per-API TTL matrix
   - Cross-reference from database handoff that discovery API responses are not stored in IndexedDB.

## Acceptance Criteria
- Expired discovery cache entries remain readable as stale.
- TTL expiry alone never deletes localStorage cache.
- New data overwrites old cache only after successful network response.
- Network failure after stale hit preserves stale data (no blank regression).
- Any capacity-driven eviction follows stale-safe hard-retention rules as a controlled exception.
- Per-API TTL policy matches this instruction.
- Country-scoped cache keys remain isolated.
- After successful revalidation, visible active page/query state is updated without requiring manual navigation or hard refresh.
- Explicit maintenance cleanup is reachable only via the single exported trigger function; no other call site may invoke cleanup directly.

## Required Tests
1. Provider/cache unit tests
- stale entry returns data with `stale` status.
- stale + revalidate success overwrites cache timestamp/data.
- stale + revalidate failure keeps old data and timestamp.
- miss path writes cache on success.

2. API-specific behavior tests
- top charts and lookup APIs honor 24h profile.
- podcast episode lookup honors 12h profile.
- search APIs remain 30m.
- RSS parsed feed remains 24h.

3. Safety tests
- no cross-country cache hit for country-sensitive keys.
- bounded cleanup does not remove fresh/stale entries during read phase.
- concurrent stale revalidations are deduped.
- hard-retention behavior is deterministic and asserted:
  - entries within `HARD_RETENTION_MS` are protected from eviction.
  - entries beyond `HARD_RETENTION_MS` are evictable according to documented order.
- controlled-exception path is explicitly covered:
  - when capacity eviction occurs, stale-safe protection still holds and no protected fallback entry is evicted.
- manual-maintenance trigger integrity is covered:
  - only the single manual maintenance trigger point can invoke explicit maintenance cleanup.
  - app boot/background read/passive navigation paths are asserted not to invoke explicit maintenance cleanup.
  - direct calls to internal cleanup helpers from non-trigger call sites fail lint/test guard assertions (or equivalent static/runtime checks).

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/discovery/providers/apple.ts`
  - `apps/lite/src/lib/storage.ts` (only if helper extension is needed)
  - Discovery query/hook call sites that must reflect revalidate success on active pages:
    - `apps/lite/src/hooks/useDiscoveryPodcasts.ts`
    - `apps/lite/src/hooks/useDiscoverySearch.ts`
    - `apps/lite/src/hooks/useEpisodeResolution.ts`
    - Any query consumers requiring explicit `queryClient.setQueryData` / `invalidateQueries` wiring
  - discovery-related tests under `apps/lite/src/lib/**/__tests__`
  - docs under `apps/docs/content/docs/apps/lite/handoff/features/` and `.../handoff/database*`
- Regression risks:
  - stale data masking upstream changes for too long
  - background revalidation race conditions
  - localStorage growth without bounded cleanup
- Required verification:
  - stale-if-error behavior demonstrated by tests
  - no empty-state regression when stale exists

## Forbidden Dependencies
- Do not add new cache libraries.
- Do not move discovery API responses into IndexedDB in this instruction.
- Do not introduce schema migrations for this change.

## Required Patterns
- Keep `country` in all discovery cache keys.
- Use deduped network fetch path for revalidation.
- Prefer deterministic, testable cache helpers over ad-hoc inline checks.
- Maintain Zustand atomic selector usage in any touched UI code.
- Route all explicit maintenance cleanup through the single exported trigger function (`runDiscoveryCacheMaintenance()` or project-equivalent exact name).

## Decision Log
- Required: Yes.
- Record this architecture decision and rationale in:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH docs for any changed cache semantics and TTL matrix:
  - `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/discovery.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint` (fails on pre-existing formatting issue in `src/lib/fetchUtils.ts`)
  - `pnpm -C apps/lite typecheck` (pass)
  - `pnpm -C apps/lite test:run` (pass)
- Date: 2026-02-08
