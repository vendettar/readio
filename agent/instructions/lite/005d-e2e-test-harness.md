> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/testing-guide.mdx` and `apps/docs/content/docs/apps/lite/debugging.mdx` before starting.

# Task: Isolate E2E Test Hooks from Production Code

## Objective
Move E2E-only helpers (e.g., raw Dexie access) into a test-only harness and replace production `id` selectors with `data-testid` to avoid polluting app code paths.

## Decision Log
- **Required / Waived**: Waived (no rule-doc changes).

## Bilingual Sync
- **Required / Not applicable**: Not applicable.

## Steps
1. Create a test-only harness module:
   - Add `apps/lite/src/testHarness.ts` that exports a `registerTestHarness()` function.
   - Inside it, expose `window.__READIO_TEST__` with `router`, `queryClient`, `db`, and `rawDb`.
   - Guard it behind `import.meta.env.VITE_E2E === 'true'` or `import.meta.env.MODE === 'test'`.
2. Update `apps/lite/src/main.tsx`:
   - Remove direct `rawDb` export from the production path.
   - Conditionally import and call `registerTestHarness()` only when the test flag is enabled.
3. Update E2E tests to rely on the harness:
   - Ensure `apps/lite/tests/e2e/local-file-flow.spec.ts` expects the harness to be available only in test mode.
4. Replace test selectors to avoid production `id` usage:
   - Use `data-testid` for the “add audio” button and file input in
     `apps/lite/src/routeComponents/files/FilesIndexPage.tsx` and
     `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`.
   - Update E2E tests to use `getByTestId`.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- No doc updates required.
