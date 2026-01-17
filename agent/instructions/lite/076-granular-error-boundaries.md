> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` before starting.

# Task: Implement Granular Error Boundaries

## Objective
Isolate component crashes to prevent a single rendering error (e.g., in a malformed RSS description) from breaking the entire application.

## 1. Create `ComponentErrorBoundary`
- **Path**: `apps/lite/src/components/ui/error-boundary.tsx`.
- **Implementation**: A class-based React Error Boundary that renders a localized "Component failed to load" placeholder with a retry button.
- **i18n**: Use `translate()` from `src/lib/i18nUtils.ts` (non-React context).

## 2. Wrap Critical Nodes
- **Target**: `TranscriptView`, `EpisodeRow`, `Sidebar`.
- **Action**: Wrap these specific components in the new `ComponentErrorBoundary`.
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
