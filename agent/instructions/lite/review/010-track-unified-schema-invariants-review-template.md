# Track Unified Schema Invariants Review Template

## Purpose
Specialized review for unified `tracks` schema safety, with focus on discriminator correctness and cross-table integrity.

## Trigger
Use whenever `tracks`, `sourceType`, track guards, lookup strategy, or related deletion/import logic changes.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Modules: `{{PATHS}}`
- Tables/entities: `tracks`, `local_subtitles`, `subtitles`, `audioBlobs`, `playback_sessions`

## Required Checks
1. `sourceType` guard discipline:
   - branch logic uses shared runtime constants/guards only
   - no duplicated string literals for discriminator behavior
2. Composite index usage:
   - lookup paths prefer indexed predicates (e.g. `[sourceType+sourceUrlNormalized]`)
   - no hot-path `toArray()+filter` fallback when indexed query is feasible
3. Domain isolation:
   - upload/download codepaths do not read/write each other's rows by accident
   - repository APIs enforce domain-safe access
4. Delete and cleanup integrity:
   - deleting a track does not orphan related subtitle/blob/session state
   - playback session links (`localTrackId`) are cleared or remapped intentionally
5. Import/export and integrity compatibility:
   - import payloads cannot violate discriminator invariants
   - integrity checks and repair routines understand unified schema fields
6. Migration/backfill safety:
   - refactors preserve existing row readability and query behavior
   - no hidden behavior change in fallback lookup semantics

## Findings
- Severity: `P0 | P1 | P2 | P3`
- Title:
- Evidence: `{{PATH:LINE}}`
- Impact:
- Fix Direction:
- Verification:

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run src/lib/db/__tests__/trackGuards.test.ts`
- `pnpm -C apps/lite test:run src/lib/__tests__/downloadService.db.test.ts`
- `pnpm -C apps/lite test:run src/lib/repositories/__tests__/DownloadsRepository.test.ts`
- `pnpm -C apps/lite test:run src/lib/player/__tests__/remotePlayback.test.ts`
- `pnpm -C apps/lite test:run src/routeComponents/__tests__/DownloadsPage.regression.test.tsx`

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
