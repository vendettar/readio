> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/security.mdx` and `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx` before starting.

# Task: Enforce CSS Isolation for Third-Party Content

## Objective
Prevent external RSS HTML (show-notes) from polluting the application's UI by enforcing strict CSS isolation.

## 1. Isolated Container
- **Target**: `apps/lite/src/components/Transcript/DescriptionView.tsx` (or where show-notes are rendered).
- **Strategy**: Apply a scoped CSS reset class (e.g., `.prose-isolate`) that resets inherited styles (`all: revert`) and re-applies app typography tokens locally.
- **Fallback**: Use Shadow DOM only if scoped reset fails to prevent leakage.

## 2. Refine DOMPurify
- **Action**: Ensure `DOMPurify` explicitly strips `<style>` and `<link>` tags from the input HTML before it reaches the isolated container (`src/lib/htmlUtils.ts`).

## 3. Verification
- **Test**: Feed a mock RSS description containing `<style>body { background: red !important; }</style>`.
- **Check**: The application's background MUST NOT turn red.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/security.mdx` (Content isolation).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
