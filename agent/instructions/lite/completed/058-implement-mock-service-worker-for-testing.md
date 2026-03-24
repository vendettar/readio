> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` before starting.

# Task: Implement MSW for Network Testing [COMPLETED]

## Objective
Establish a reliable way to test network-dependent logic (Search, RSS parsing) without hitting actual APIs or writing brittle mocks.

## 1. Setup MSW
- **Action**: `pnpm --filter @readio/lite add -D msw`.
- **Action**: Initialize MSW in `apps/lite/src/__tests__/setup.ts`.

## 2. Define Handlers
- **Path**: `apps/lite/src/__tests__/handlers.ts`.
- **Mock**: Provide mock responses for:
  - `itunes.apple.com` search.
  - Standard RSS XML feeds.

## 3. Refactor Existing Tests
- **Target**: `apps/lite/src/hooks/__tests__/usePodcastSearch.test.ts`.
- **Action**: Remove manual `vi.fn()` mocks and rely on MSW interceptors.

## 4. Verification
- **Test**: Run `pnpm --filter @readio/lite test:run`.
- **Check**: Network tests should pass faster and more predictably.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/testing-guide.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D021 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- **Completed by**: Readio Worker (Coder)
- **Commands**:
  - `pnpm --filter @readio/lite add -D msw`
  - `pnpm --filter @readio/lite test:run`
- **Date**: 2026-01-30
- **Reviewed by**: CODEX
- **Status**: ✅ **Fully Complete**
  - MSW integrated for network testing
  - Podcast search hooks tests updated to use MSW
  - Standards and testing guides updated

## Patch Additions (Integrated)
# Patch: 058-implement-mock-service-worker-for-testing

## Why
Instruction 058 still references `src/__tests__` paths, which conflicts with Instruction 083's test placement rule (co-locate tests with modules).

## Additions / Clarifications
- **Test Placement**: MSW setup/handlers should live in a shared test utility folder (e.g., `apps/lite/src/testUtils/`), and each test should be co-located with its module under `__tests__`.
- **Setup File**: If a global `setup.ts` is used, define its location as a shared test utility and reference it in Vitest config; do not place it under `src/__tests__`.

## Verification (unchanged)
- `pnpm --filter @readio/lite test:run` should pass with MSW enabled.


# Patch: 058-implement-mock-service-worker-for-testing

## Why
Content-level normalization to align with Leadership requirements and prevent execution drift.

## Global Additions
- Add Scope Scan (config, persistence, routing, logging, network, storage, UI state, tests).
- Add Hidden Risk Sweep for async control flow and hot-path performance.
- Add State Transition Integrity check.
- Add Dynamic Context Consistency check for locale/theme/timezone/permissions.
- Add Impact Checklist: affected modules, regression risks, required verification.
- Add Forbidden Dependencies / Required Patterns when touching architecture or cross-module refactors.

## Task-Specific Additions
- Ensure consistent handler scope + teardown between tests.
