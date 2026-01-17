> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/index.mdx` and `apps/docs/content/docs/apps/lite/performance.mdx` before starting.

# Task: Perform Memory Stress Test

## Objective
Ensure long-term stability by identifying and fixing memory leaks that occur during extended listening sessions.

## 1. Create Stress Script
- **Action**: Create a Playwright script `apps/lite/tests/stress/memory.test.ts`.
- **Logic**:
  - Loop 50 times: Navigate to Explore -> Play random track -> Open Settings -> Navigate to Files.
  - Duration: Simulate 2 hours of heavy interaction.
 - **Note**: This script is not run in CI by default; it is a manual profiling tool.

## 2. Leak Detection
- **Action**: Use Chrome DevTools "Memory" tab or Playwright's `performance.measureUserAgentSpecificMemory`.
- **Target**: Ensure JS Heap size returns to a stable baseline after clearing all data and tabs.
- **Output**: Store heap snapshot notes under `apps/lite/tests/stress/README.md`.

## 3. Verification
- **Baseline**: The app should not exceed 150MB of heap usage for a 1-hour session with 100+ tracks in list.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/performance.mdx` (Memory guidelines).
- Update `apps/docs/content/docs/apps/lite/testing-guide.mdx` (Stress test policy).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D024 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
