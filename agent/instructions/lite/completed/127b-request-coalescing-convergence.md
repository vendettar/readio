# [COMPLETED] Instruction 127b: Request Coalescing Convergence

## Status
- [x] Active
- [x] Completed

## Goal
Converge feature-local in-flight request deduplication into the centralized `requestManager` to standardize cancellation, cleanup, and concurrency behavior across the Lite app.

## Scope
- `apps/lite/src/lib/requestManager.ts`
- `apps/lite/src/lib/remoteTranscript.ts` (Refactor `inFlightRevalidations`)
- `apps/lite/src/lib/downloadService.ts` (Refactor `inFlightDownloads`)
- `apps/lite/src/lib/i18n.ts` (Refactor `inFlightLocaleLoads`)
- `apps/lite/src/store/exploreStore.ts` (Refactor using `deduplicatedFetchWithCallerAbort`)
- `apps/lite/src/store/filesStore.ts` (Refactor using `deduplicatedFetchWithCallerAbort`)
- `apps/lite/src/store/historyStore.ts` (Refactor using `deduplicatedFetchWithCallerAbort`)
- `apps/lite/src/lib/inflightCoalescer.ts` (Deleted - fully converged)

## Requirements
1. Migrate `remoteTranscript.ts`'s `inFlightRevalidations` to use `requestManager.deduplicatedFetch`.
2. Migrate `downloadService.ts`'s `inFlightDownloads` to use `requestManager.deduplicatedFetch`.
3. Ensure `AbortSignal` (from caller) is correctly chained with the internal `AbortController` (from dedup).
4. Standardize use of `toAbortError` or consistent error names (e.g., `AbortError`) to avoid domain-specific aborted states where possible.
5. Preserve existing features:
   - `downloadService` sequential execution (semaphore) must be maintained.
   - `remoteTranscript` revalidation logic (skip if in-flight).

## Verification
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run src/lib/__tests__/remoteTranscript.test.ts src/lib/__tests__/downloadService.db.test.ts src/lib/__tests__/i18nChangeLanguageSafely.test.ts`
- `pnpm -C apps/lite build`

## Completion
- Completed by: Antigravity
- Commands: `pnpm -C apps/lite build`, `pnpm -C apps/lite test:run`
- Date: 2024-05-24
- Reviewed by: Antigravity (Agent)
