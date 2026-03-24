# Instruction 127d1: Schema And Repository Cutover [COMPLETED]

## Status
- [x] Active
- [x] Completed

## Hard Dependencies
- `agent/instructions/lite/127d-schema-unification-feasibility.md`

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`

## Goal
Complete phase-1/2 cutover:
1. Introduce unified `tracks` contract in schema/types.
2. Move repository read/write authority to unified store projections by `sourceType`.
3. Remove dual-store repository branching.

## Scope
- `apps/lite/src/lib/db/types.ts`
- `apps/lite/src/lib/dexieDb.ts`
- `apps/lite/src/lib/repositories/FilesRepository.ts`
- `apps/lite/src/lib/repositories/DownloadsRepository.ts`
- `apps/lite/src/lib/repositories/**/__tests__/*`
- `apps/lite/src/lib/**/__tests__/dbOperations.test.ts`

## Scope Scan (8 Scopes)
- Config:
  - No runtime config change.
- Persistence:
  - High impact: schema and repository contract become unified.
- Routing:
  - No route-path change.
- Logging:
  - Preserve repository error taxonomy and keys.
- Network:
  - No protocol behavior change.
- Storage:
  - High impact: remove dual-store persistence path in repository layer.
- UI state:
  - Indirect impact only through repository projections.
- Tests:
  - High impact: repository and DB contract tests must be updated.

## Product Decisions (Locked)
1. No backward compatibility path for `local_tracks` / `podcast_downloads`.
2. Unified `tracks.sourceType` uses:
   - `'user_upload'`
   - `'podcast_download'`
3. Repository APIs become the only UI/runtime access path for track data.

## Hidden Risk Sweep
- Async:
  - Repository read/write order must remain transactional to avoid temporary orphan subtitle references.
- Hot path:
  - Avoid per-row DB lookups in repository list methods; use indexed queries and batched reads.

## State Transition Integrity
1. Repository cutover must not create a state where playback/session restore receives a non-resolvable track id.
2. Writes that change track identity contract must remain atomic with subtitle linkage semantics.

## Dynamic Context Consistency
1. `sourceType`-based projection queries must not rely on stale module-level caches.
2. Repository outputs must remain stable across language/country context changes because track identity is context-independent.

## Required Patterns
1. Discriminated union in TypeScript for track shape.
2. Deterministic repository projections:
   - files-view => `sourceType='user_upload'`
   - downloads-view => `sourceType='podcast_download'`
3. Remove dead repository code referencing old store names.

## Forbidden Dependencies
- No new DB library.
- No runtime fallback branch for old store reads.

## Acceptance Criteria
1. Schema/types compile with unified `tracks` model.
2. Repository tests pass for both source types.
3. No repository method branches on old dual tables.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/FilesRepository.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/DownloadsRepository.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/dbOperations.test.ts`
- `bash -lc "if rg -n '\\b(local_tracks|podcast_downloads)\\b' apps/lite/src/lib/repositories apps/lite/src/lib/db --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy dual-store reference found in schema/repository layer' && exit 1; fi"`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/db/types.ts`
  - `apps/lite/src/lib/dexieDb.ts`
  - `apps/lite/src/lib/repositories/FilesRepository.ts`
  - `apps/lite/src/lib/repositories/DownloadsRepository.ts`
- Regression risks:
  - Wrong `sourceType` projections causing Files/Downloads cross-contamination.
  - Broken active subtitle linkage due to repository contract changes.
- Required verification:
  - All commands above pass before activating `127d2`.

## Decision Log
- Required: Waived (implementation slice only; parent `127d`/`127d3` own final architectural log entry).

## Bilingual Sync
- Not applicable for this slice.

## Completion
- Completed by: Gemini CLI
- Commands: Evaluated types, Dexie schema, and Repositories. Ran tsc and vitest to verify changes.
- Date: 2026-02-27
- Reviewed by: Codex
