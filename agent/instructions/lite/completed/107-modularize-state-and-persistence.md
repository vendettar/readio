# Task: 107 - Introduce Repository Boundary for Store Persistence (Phase 1) [COMPLETED]

## Objective
Reduce state/persistence coupling by introducing repository modules as a persistence boundary, while keeping existing store APIs and runtime behavior unchanged.

## Product Decision (Fixed)
1. This instruction is **Phase 1 only**:
   - extract repository modules.
   - migrate store persistence calls to repositories.
   - no store split in this phase.
2. Add repositories under `apps/lite/src/lib/repositories/`:
   - `LibraryRepository.ts` (subscriptions/favorites)
   - `PlaybackRepository.ts` (playback sessions/audio blobs)
   - `FilesRepository.ts` (folders/tracks/subtitles/settings)
3. Keep existing public store APIs unchanged:
   - `useExploreStore`
   - `usePlayerStore`
   - `useHistoryStore`
   - `useFilesStore`
4. Keep `DB` as internal implementation dependency behind repositories in this phase.
5. Defer store decomposition (`useLibraryStore` etc.) to a future instruction.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema or data migration changes.
- Routing:
  - No route changes.
- Logging:
  - Keep existing error logging behavior unchanged.
- Network:
  - No network changes.
- Storage:
  - Keep localStorage keys and IndexedDB tables unchanged.
- UI state:
  - No UI behavior changes.
- Tests:
  - Add repository tests and keep store behavior tests passing.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Repository wrappers must preserve abort/cancellation-sensitive call ordering in store actions.
- Hot-path performance:
  - Avoid additional mapping/serialization overhead on frequent progress updates.
- State transition integrity:
  - Store state transitions must remain unchanged after persistence call indirection.
- Dynamic context consistency:
  - Country/language-dependent state should not be memoized in repository modules.

## Implementation Steps (Execute in Order)
1. **Create repository modules and interfaces**
   - Add:
     - `apps/lite/src/lib/repositories/LibraryRepository.ts`
     - `apps/lite/src/lib/repositories/PlaybackRepository.ts`
     - `apps/lite/src/lib/repositories/FilesRepository.ts`
   - Required behavior:
     - expose typed methods mirroring currently used DB operations.
     - no behavioral transformation; thin pass-through only.

2. **Migrate explore persistence calls to LibraryRepository**
   - Update:
     - `apps/lite/src/store/exploreStore.ts`
   - Required behavior:
     - replace direct `DB` persistence calls used for subscriptions/favorites/settings with repository methods.
     - keep request-id race guards and hydration flags unchanged.

3. **Migrate history/player/files persistence calls to repositories**
   - Update:
     - `apps/lite/src/store/historyStore.ts`
     - `apps/lite/src/store/playerStore.ts`
     - `apps/lite/src/store/filesStore.ts`
   - Required behavior:
     - replace direct `DB` calls with corresponding repository methods.
     - keep existing action signatures and state fields unchanged.

4. **Keep DB module compatibility**
   - Keep `apps/lite/src/lib/dexieDb.ts` unchanged in schema and behavior.
   - Do not remove `DB` exports in this phase.

5. **Docs sync (atomic)**
   - Update architecture docs to record repository boundary and phase-1 scope limitation.

## Acceptance Criteria
- Store APIs and UI behavior are unchanged.
- Persistence access in stores goes through repositories, not direct `DB` calls for migrated paths.
- No schema changes and no data migration introduced.
- Existing tests for store behavior remain green.
- Migrated stores (`exploreStore`, `historyStore`, `playerStore`, `filesStore`) no longer directly import `DB`.

## Required Tests
1. Add:
   - `apps/lite/src/lib/repositories/__tests__/LibraryRepository.test.ts`
   - `apps/lite/src/lib/repositories/__tests__/PlaybackRepository.test.ts`
   - `apps/lite/src/lib/repositories/__tests__/FilesRepository.test.ts`
   - Assert wrapper method parity with existing DB contracts.
2. Update:
   - `apps/lite/src/store/__tests__/exploreStore.test.ts`
   - `apps/lite/src/store/__tests__/playerStore.test.ts`
   - Keep existing assertions; verify behavior unchanged after repository indirection.
3. Add:
   - `apps/lite/src/store/__tests__/historyStore.repository-boundary.test.ts`
   - Assert history operations call repository methods with expected parameters.
4. Add:
   - `apps/lite/src/store/__tests__/filesStore.repository-boundary.test.ts`
   - Assert files operations use repository methods and preserve existing action behavior.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/LibraryRepository.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/PlaybackRepository.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/FilesRepository.test.ts`
- `pnpm -C apps/lite test:run -- src/store/__tests__/exploreStore.test.ts`
- `pnpm -C apps/lite test:run -- src/store/__tests__/playerStore.test.ts`
- `pnpm -C apps/lite test:run -- src/store/__tests__/historyStore.repository-boundary.test.ts`
- `pnpm -C apps/lite test:run -- src/store/__tests__/filesStore.repository-boundary.test.ts`
- `rg -n \"import\\s+.*\\bDB\\b\" apps/lite/src/store/exploreStore.ts apps/lite/src/store/historyStore.ts apps/lite/src/store/playerStore.ts apps/lite/src/store/filesStore.ts`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/repositories/LibraryRepository.ts` (new)
  - `apps/lite/src/lib/repositories/PlaybackRepository.ts` (new)
  - `apps/lite/src/lib/repositories/FilesRepository.ts` (new)
  - `apps/lite/src/store/exploreStore.ts`
  - `apps/lite/src/store/historyStore.ts`
  - `apps/lite/src/store/playerStore.ts`
  - `apps/lite/src/store/filesStore.ts`
  - tests under:
    - `apps/lite/src/lib/repositories/__tests__/`
    - `apps/lite/src/store/__tests__/`
    - `apps/lite/src/store/__tests__/filesStore.repository-boundary.test.ts` (new)
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
- Regression risks:
  - missed store call site still directly using DB
  - parameter mismatch between store and repository wrappers
  - hidden behavior drift due to wrapper transformation
- Required verification:
  - repository tests pass
  - store tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new state libraries.
- Do not split stores in this phase.
- Do not modify Dexie schema/version.

## Required Patterns
- Repositories are thin persistence adapters.
- Store public APIs remain stable.
- Preserve atomic selector usage and current action semantics.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec vitest run src/lib/repositories/__tests__/LibraryRepository.test.ts src/lib/repositories/__tests__/PlaybackRepository.test.ts src/lib/repositories/__tests__/FilesRepository.test.ts src/store/__tests__/exploreStore.test.ts src/store/__tests__/playerStore.test.ts src/store/__tests__/historyStore.repository-boundary.test.ts src/store/__tests__/filesStore.repository-boundary.test.ts`
  - `rg -n "import\\s+.*\\bDB\\b" apps/lite/src/store/exploreStore.ts apps/lite/src/store/historyStore.ts apps/lite/src/store/playerStore.ts apps/lite/src/store/filesStore.ts`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
