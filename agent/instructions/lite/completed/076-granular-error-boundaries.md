> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` before starting.

# Task: Implement Granular Error Boundaries [COMPLETED]

## Objective
Isolate component crashes to prevent a single rendering error (e.g., in a malformed RSS description) from breaking the entire application.

## 1. Create `ComponentErrorBoundary`
- **Path**: `apps/lite/src/components/ui/error-boundary.tsx`.
- **Implementation**: A class-based React Error Boundary that renders a localized "Component failed to load" placeholder with a retry button.
- **i18n**: Use `translate()` from `src/lib/i18nUtils.ts` (non-React context).
- **i18n keys (required)**:
  - `errorBoundaryTitle`
  - `errorBoundaryDescription`
  - `errorBoundaryRetry`
- **Layout constraint**: Fallback must preserve layout height to avoid list jumping.
- **Retry behavior**: Retry should only reset the local boundary state (no global data refetch unless the wrapped component already does so).

## 2. Wrap Critical Nodes
- **Target**: `TranscriptView`, `EpisodeRow`, `Sidebar`.
- **Action**:
  - Wrap **individual `EpisodeRow` items** (not the entire list).
  - Wrap `TranscriptView` and `Sidebar` at the smallest stable component boundary.
- **Rule**: Do NOT wrap entire pages or router roots; keep the boundary as granular as possible.

## 3. Verification
- **Test**: Deliberately throw an error inside a single `EpisodeRow` (mocked).
- **Check**: The rest of the episode list and the main player should remain functional. Only the crashed row should show the error state.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` (Error handling patterns).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- Completed by: Codex
- Commands: `pnpm --filter @readio/lite lint`, `pnpm --filter @readio/lite typecheck`
- Date: 2026-02-05

## Patch Additions (Integrated)
# Patch: 076-granular-error-boundaries

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
- Define error reporting policy for boundaries (which report telemetry).
