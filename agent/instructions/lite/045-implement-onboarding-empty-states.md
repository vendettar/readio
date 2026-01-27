> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Onboarding & Empty States

## Objective
Ensure a positive "First Run" experience by replacing blank screens with actionable onboarding guides.

## 1. Enhance `<EmptyState />`
- **Target**: `apps/lite/src/components/ui/empty-state.tsx`.
- **Requirement**: Ensure the component supports a primary CTA and an optional secondary descriptive text.
- **Rule**: CTA must be a shadcn `<Button>`, not a raw `<a>` tag.

## 2. Implement View-Specific Onboarding
- **Default**: Reuse existing layout/spacing patterns on each page; do not introduce new page-level layouts.
- **Subscriptions Page**: If empty, show "No Subscriptions" with a CTA "Explore Podcasts" (links to `/explore`).
- **Files Page**: If empty, show a large, prominent "Drop Area" with the text "Drag and drop your first MP3 or SRT file here to begin".
- **Favorites/History**: If empty, explain how to add items (e.g., "Heart an episode to see it here").

## 3. Localization
- **Action**: Add all onboarding copy to `apps/lite/src/lib/translations.ts`.
- **Keys**: `onboarding.files.title`, `onboarding.subscriptions.cta`, etc.

## 4. Verification
- **Test**: Open the app with a fresh IndexedDB.
- **Check**: Navigate through all main tabs. Each should have a helpful guide instead of a blank screen.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx` (Empty state patterns).
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx` (UI patterns for empty states).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
