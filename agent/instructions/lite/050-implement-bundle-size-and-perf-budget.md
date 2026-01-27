> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` before starting.

# Task: Implement Bundle Size & Perf Budget

## Objective
Establish a baseline for application performance and bundle size to prevent regressions during the "UX Upgrade" phase.

## 1. Setup `rollup-plugin-visualizer`
- **Action**: Add the visualizer plugin to `apps/lite/vite.config.ts`.
- **Config**: Generate a `stats.html` file on every build.

## 2. Define CI Budgets
- **Action**: In `apps/lite/package.json`, define a `size-limit` (if using size-limit) or a simple script to check `dist/` size.
- **Default**: Use a simple `dist/` size check script (do not introduce `size-limit` unless already present).
- **Budget**:
  - Main JS Entry: < 250KB (Gzipped).
  - Total Assets: < 1MB (Excluding icons/images).
 - **Rule**: Enforce the budget in CI (Instruction 044).

## 3. Performance Metrics
- **Action**: Implement a simple `useReportWebVitals` hook that logs Core Web Vitals (LCP, FID, CLS) to the `Local Logger` created in Instruction 047.

## 4. Verification
- **Test**: Run `pnpm --filter @readio/lite build`.
- **Check**: Open `stats.html` and verify which libraries (e.g., `framer-motion`, `lucide`) are consuming the most space.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/performance.mdx` (Budgets).
- Update `apps/docs/content/docs/general/technical-roadmap.mdx` (Performance phase).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D013 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
