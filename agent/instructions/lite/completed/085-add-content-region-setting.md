# Task: Add Content Region Setting (Global Country Preference) [COMPLETED]

## Objective
Add a user-facing `Content Region` selector in Settings so users can switch country/region for podcast content.  
This is a global preference and must drive discovery flows (Explore, Search, Top lists) through existing store state.
Library detail routing (`Subscriptions` / `Favorites` / `History`) is governed by Instruction 086 and is out of scope for this instruction.

## Product Decision (Fixed)
- Placement: `SettingsPage` -> `General` card -> directly below `Language`.
- Not in Explore page filters.
- Label:
  - EN: `Content Region`
  - ZH: `内容地区`
- Data flow: update `useExploreStore.setCountry()` and persist via existing IDB setting (`explore_country`).

## Scope Scan (Required)
- Config: no new env/config key.
- Persistence: reuse existing `DB.setSetting('explore_country', ...)`.
- Routing: no new route.
- Logging: no new telemetry requirement.
- Network: region change must affect subsequent discovery/iTunes requests.
- Storage: no schema change.
- UI state: Settings only; no Explore control addition.
- Tests: add/update unit/integration coverage for Settings interaction + country propagation.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Prevent UI/store race between initial country hydration and first discovery requests.
  - Avoid double writes when user taps region buttons rapidly.
- Hot-path performance:
  - Region options rendering must stay static/cheap (no per-render recomputation from heavy sources).
  - Do not introduce broad store subscriptions in Settings.
- State transition integrity:
  - Region switch must not push app into unusable loading/error-only state.
  - Discovery queries should remain actionable during country transitions.
- Dynamic context consistency:
  - Ensure country-dependent query keys remain country-scoped.
  - Prevent mixed-country cache bleed after switching region.

## Implementation Steps (Execute in Order)
1. **Confirm existing country SSOT**
   - Keep `useExploreStore.country` as the single source of truth.
   - Do not introduce a separate settings-country store.

2. **Add Settings UI control**
   - File: `apps/lite/src/routeComponents/SettingsPage.tsx`
   - In `General` card, add a `Content Region` control under the `Language` block.
   - Use existing design system components already used on this page (`Label`, `Button`, or current selector pattern).
   - Read state with atomic selectors:
     - `const country = useExploreStore((s) => s.country)`
     - `const setCountry = useExploreStore((s) => s.setCountry)`

3. **Use explicit region options**
   - Build options from existing supported regions (prefer shared constant/type from `apps/lite/src/constants/app.ts`).
   - Do not hardcode duplicate region lists in multiple files.
   - Normalize outgoing value to lowercase country code.

4. **Wire behavior**
   - On selection, call `setCountry(code)`.
   - Do not add page refresh requirement.
   - Do not add temporary local state that can diverge from store state.

5. **Ensure fetch behavior stays aligned**
   - Verify discovery-side country-dependent flows react correctly after change:
     - Explore top content hooks using `country`.
     - `discovery.searchPodcasts(..., country, ...)`.
     - Discovery entry points that are expected to follow global country.
   - If any path still hardcodes `us`, replace with store/config-derived country.

6. **Respect 086 boundary**
   - Do not implement or alter library detail country source in this task.
   - If a library flow is touched incidentally, keep behavior unchanged and let Instruction 086 own it.
7. **i18n updates**
   - Add translation keys for new Settings label/help text in all supported locale files.
   - Keep naming consistent with existing Settings keys.

8. **Docs sync**
   - Update docs to reflect final UX decision (global preference in Settings, not Explore filter):
     - `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
     - `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
   - If any wording implies this is Explore-only filtering, correct it.

## Acceptance Criteria
- Settings page shows `Content Region` directly under `Language`.
- Selecting region updates `useExploreStore.country` and persists across reload/open.
- Region change affects subsequent Explore/Search/discovery-side iTunes lookup requests.
- No duplicate source of truth for country.
- No UI regression in General card layout.

## Required Tests
- Update/add tests for Settings interaction:
  - selecting a region triggers `setCountry` with expected code.
- Keep/extend store tests:
  - `setCountry` updates state and persists via DB setting path.
- If applicable, verify a country-dependent query key or discovery call receives updated country.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/routeComponents/SettingsPage.tsx`
  - `apps/lite/src/store/exploreStore.ts`
  - `apps/lite/src/constants/app.ts` (if region options/type are centralized here)
  - i18n resources under `apps/lite/src/lib/translations.ts`
  - Docs:
    - `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
- Regression risks:
  - Region selector UI drift from existing Settings layout.
  - Inconsistent region option lists if duplicated across files.
  - Discovery requests still hardcoding `us` in untouched paths.
- Required verification:
  - Selector interaction test confirms store update + persistence.
  - Discovery paths use selected country after switch.
  - No unintended changes to library detail routing (owned by 086).

## Constraints
- Forbidden:
  - Adding country switch UI to Explore page in this task.
  - Adding new dependency for region picker.
  - Introducing a second persistence key for country.
- Required patterns:
  - Zustand atomic selectors.
  - Existing Settings UI style/pattern consistency.

## Decision Log
- Required: No (existing product decision already confirmed in instruction context).

## Bilingual Sync
- Required: Yes (EN + ZH docs and i18n strings).

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint` (fails on pre-existing formatting issue in `src/lib/fetchUtils.ts`)
  - `pnpm -C apps/lite typecheck` (pass)
  - `pnpm -C apps/lite test:run` (pass)
- Date: 2026-02-08
