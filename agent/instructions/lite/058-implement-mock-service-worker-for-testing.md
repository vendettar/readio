> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` before starting.

# Task: Implement MSW for Network Testing

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
