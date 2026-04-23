# Instruction 127d: Track Schema Unification Implementation (Umbrella)

## Status
- [ ] Active
- [ ] Completed

## Umbrella Status Policy
1. This umbrella instruction remains non-active during implementation.
2. Only one child instruction (`127d1` or `127d2` or `127d3`) may be Active at a time.
3. Parent completion is allowed only after all three child instructions are completed and reviewed.

## Hard Dependencies
- `agent/instructions/lite/127-architectural-findings-remediation.md`
- `agent/instructions/lite/completed/127a-transcriber-transport-policy.md` must be completed and reviewed.
- `agent/instructions/lite/completed/127b-request-coalescing-convergence.md` must be completed and reviewed.
- `agent/instructions/lite/completed/127f-asr-settings-snapshot-ssot.md` must be completed and reviewed.
- `agent/instructions/lite/completed/127c-store-boundary-refactor.md` must be completed and reviewed.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
- `apps/docs/content/docs/general/technical-roadmap.mdx`

## Goal
Replace dual track stores (`local_tracks`, `podcast_downloads`) with one unified `tracks` store using a strict `sourceType` discriminator.

Expected outcome:
1. Runtime track lookup is single-source (no dual-table fallback checks).
2. Subtitle/session foreign-key semantics target one track table only.
3. File and download views are projections over one table (`sourceType` filter), not separate storage systems.

## Product Decisions (Locked)
1. This is an implementation instruction, not feasibility-only analysis.
2. First-release policy applies: no legacy migration/backfill support is required.
3. No cleanup/migration management plan is required in this phase; implementation can assume fresh first-release storage.
4. Use one canonical track entity with discriminated union:
   - `sourceType: 'user_upload' | 'podcast_download'`.
5. Remove runtime dependence on `local_tracks` and `podcast_downloads`.
6. `127e` metadata normalization remains out of scope.

## Schema Transition Policy (No Migration)
1. This is a hard schema transition under first-release policy.
2. No backward compatibility branch for old dual-table persisted data is required.
3. Validation and QA must be executed on clean storage baseline (clear site data / fresh DB).
4. Startup/runtime fallback branches for legacy dual-table reads are forbidden.

## Track ID Contract (Required)
1. Unified `tracks.id` is the only runtime target for track foreign keys.
2. `PlaybackSession.localTrackId` and `local_subtitles.trackId` must reference `tracks.id` only.
3. Repository APIs must not expose dual-table identity semantics after cutover.

## Decision Compare
1. Option A: Keep dual tables (`local_tracks` + `podcast_downloads`)
   - Cost: Low now, high long-term maintenance.
   - Risk: Medium drift risk in identity/subtitle/session linking.
   - Reversibility: High.
   - Impact: Continued repository/runtime branching.
2. Option B: Unify into one `tracks` table with `sourceType` (Selected)
   - Cost: High one-time refactor.
   - Risk: Medium-high short-term regression risk.
   - Reversibility: Medium.
   - Impact: Removes dual-path branching and simplifies long-term evolution.

## Instruction Sizing (Execution Constraint)
- This instruction is an umbrella and must be delivered in three atomic passes (one pass per review cycle):
  1. Schema/types/repository contract.
  2. Runtime consumers (playback/session/transcript/integrity/retention/vault).
  3. Page wiring/tests/docs/cleanup.
- Do not land all phases in one pass.
- Required split output:
  - `127d1-schema-and-repository-cutover.md`
  - `127d2-runtime-consumer-cutover.md`
  - `127d3-ui-tests-docs-cleanup.md`
- Activation gate:
  - Only `127d1` may be marked Active initially.
  - `127d2` may be marked Active only after `127d1` is completed and reviewed.
  - `127d3` may be marked Active only after `127d2` is completed and reviewed.

## Scope
- `apps/lite/src/lib/db/types.ts`
- `apps/lite/src/lib/dexieDb.ts`
- `apps/lite/src/lib/repositories/FilesRepository.ts`
- `apps/lite/src/lib/repositories/DownloadsRepository.ts`
- `apps/lite/src/lib/downloadService.ts`
- `apps/lite/src/lib/remoteTranscript.ts`
- `apps/lite/src/lib/integrity.ts`
- `apps/lite/src/lib/retention.ts`
- `apps/lite/src/lib/vault.ts`
- `apps/lite/src/store/**`
- `apps/lite/src/routeComponents/**`
- `apps/lite/src/lib/**/__tests__/*`
- `apps/lite/src/routeComponents/**/__tests__/*`
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`

## Non-Goals
- No metadata normalization (`127e`).
- No cloud sync contract design.
- No new backend dependency.

## Scope Scan (8 Scopes)
- Config:
  - No new runtime config key.
- Persistence:
  - High impact. Core schema/store contract changes.
- Routing:
  - No route path changes, but route data loaders can be affected by repository contract changes.
- Logging:
  - Keep error keys stable while changing lookup internals.
- Network:
  - No direct protocol changes.
- Storage:
  - High impact. Track/subtitle/session references are re-anchored to unified table.
- UI state:
  - Medium impact. Pages that currently assume separate stores must filter by `sourceType`.
- Tests:
  - High impact. Repository, playback, session, and page behavior tests must be updated.

## Hidden Risk Sweep
- Async control flow risks:
  - stale `localTrackId` resolution paths can regress during dual-table removal.
  - playback restore path may read missing track if repositories are partially migrated.
- Hot-path performance risks:
  - normalized model can introduce N+1 reads if list pages fetch metadata per row.
  - repository APIs must batch reads in one transaction or `bulkGet`.

## State Transition Integrity
1. No playback event may lose recoverability due to track-id translation changes.
2. Mini/docked/full mode behavior must remain unchanged.
3. Active subtitle switch must remain deterministic after schema switch.

## Dynamic Context Consistency
1. `sourceType` filtering must react to live store updates.
2. No module-level cache may freeze pre-unification track shapes.

## Required Patterns
1. Single track SSOT with discriminated union typing.
2. Repository-layer encapsulation:
   - UI must not branch on old table names.
3. Strict cleanup:
   - remove dead code referencing `local_tracks` / `podcast_downloads`.
4. Deterministic ordering:
   - preserve existing visible order and fallback rules in list/read paths.

## Forbidden Dependencies
- No new state management library.
- No backend or sync layer introduction.
- No compatibility branch for legacy dual-table runtime behavior.

## Execution Path

### Phase 1: Schema Contract
1. Define unified `Track` type in `types.ts` with `sourceType`.
2. Update Dexie schema to use unified `tracks` store as authoritative source.
3. Remove old dual-track store contracts from runtime-facing DB APIs.

### Phase 2: Repository Unification
1. Refactor `FilesRepository` and `DownloadsRepository` to operate over unified track store projections.
2. Eliminate dual lookup fallback (`getFileTrack` then `getPodcastDownload`) in runtime paths.
3. Keep page-level behavior stable via repository APIs.

### Phase 3: Runtime Path Updates
1. Update playback/session/transcript consumers to single track lookup.
2. Update integrity/retention cleanup logic to unified reference set.
3. Update vault import/export contract to unified track store.

### Phase 4: Cleanup + Docs
1. Remove stale code branches, types, and tests referencing old dual-table runtime paths.
2. Update database handoff docs in both languages.
3. Update decision log with rationale and accepted risks under first-release policy.

## Acceptance Criteria
1. Runtime no longer depends on separate `local_tracks` and `podcast_downloads` stores.
2. `localTrackId` resolves through one authoritative track source.
3. Files and Downloads pages still work via `sourceType`-based projections.
4. Subtitle active/fallback behavior is unchanged.
5. No route or playback UX regression.
6. Handoff docs (`database.mdx` + `database.zh.mdx`) match actual schema.
7. Handoff index status is synchronized (`handoff/index.mdx` + `handoff/index.zh.mdx`) without implementation detail leakage.

## Required Tests
- Repository:
  - unified track CRUD by `sourceType`.
  - subtitle active/fallback against unified track IDs.
- Runtime:
  - playback/session restore with unified track lookup.
  - remote transcript cached apply path with unified track IDs.
- Page behavior:
  - Files list renders only `user_upload`.
  - Downloads list renders only `podcast_download`.
  - Downloads subtitle play path: active/override/fallback behavior remains unchanged.
- Integrity/retention:
  - orphan detection and cleanup remain correct.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`
- `bash -lc "if rg -n '\\b(local_tracks|podcast_downloads)\\b' apps/lite/src --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy dual-track store reference found' && exit 1; fi"`
- `bash -lc "if rg -n 'getFileTrack\\(|getPodcastDownload\\(' apps/lite/src/lib apps/lite/src/store apps/lite/src/routeComponents --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy dual-track lookup API usage found' && exit 1; fi"`

## Impact Checklist
- Affected modules:
  - DB schema/types
  - repositories
  - playback/session/transcript paths
  - integrity/retention/vault
- Regression risks:
  - track identity mismatch in restore paths
  - list-page data projection mismatch
  - fallback subtitle resolution regression
- Required verification:
  - all commands above pass
  - manual smoke: Files, Downloads, History playback, subtitle switch

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
- Must include:
  - why unification is activated now
  - risks accepted under first-release policy
  - explicit note that legacy migration/backfill is intentionally out of scope in first-release

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:

## Pass Failure Boundary (Required)
1. Failure handling granularity is per atomic pass (`127d1` / `127d2` / `127d3`), not partial-file edits.
2. If pass N fails verification, stop and fix pass N before starting pass N+1.
