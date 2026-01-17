> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Upgrade UI Design System (Glassmorphism)

## Objective
The Design System has been updated to include "Premium Glass" materials (Apple-like blur/saturation) and stricter semantic color usage.
We must upgrade the application shell and cards to match the new Vibe.

## 1. Global CSS (`apps/lite/src/index.css`)
- **Action**: Ensure the "System Utilities" (whitelist B) are present:
  - `.reading-area`
  - `.is-dragging`
  - `.smart-divider`
  - `.scrollbar-none`
- **Documentation**: If you add or modify these classes, you MUST update the "Global CSS Whitelist" section in `apps/docs/content/docs/general/design-system/index.mdx`.
- **Action**: Check if `backdrop-filter` utilities are enabled in Tailwind config (usually default in v3+).

## 2. Upgrade `src/components/ui/dropdown-menu.tsx`
- **Target**: `DropdownMenuContent` component.
- **Action**: Update the `className`.
  - **Old**: `rounded-md border bg-popover shadow-md`
  - **New**: `rounded-xl border border-border/50 bg-popover/95 backdrop-blur-xl backdrop-saturate-150 shadow-2xl`
  - **Verify**: Remove any `p-1` if we want full-width hover (or keep `p-0` and verify Item styling). The Design System says `p-0` for content and `px-3 py-2` for items.

## 3. Upgrade `src/components/AppShell/Sidebar.tsx`
- **Action**: Use `cn()` helper instead of template strings.
- **Action**: Replace hardcoded layout values with new Tailwind tokens (Instruction #004).
  - `w-[var(--sidebar-width)]` -> `w-sidebar`
- **Action**: Remove hardcoded colors in `ThemeToggle`.
  - Replace `bg-amber-500/10` etc. with standard `ghost` variant or Semantic Tokens (`text-primary`, `bg-accent`).
  - **Rule**: If the amber/blue distinction is important, define it as a data-attribute or utility class, don't inline raw hex/palette colors.

## 4. Refactor Sidebar & Player
- **Target**: `Sidebar.tsx` and `FullPlayer.tsx`.
- **Action**: Apply `backdrop-blur-xl` and `bg-background/80` (or similar) to create the glass effect.
- **Constraint**: Ensure text contrast remains accessible (`text-foreground`).

## 5. Refactor Cards
- **Target**: `PodcastCard.tsx`, `EpisodeRow.tsx`.
- **Action**: Remove any hardcoded borders (`border-gray-200`) and use `border-border/50` for subtle separation.
- **Hover**: Add `hover:bg-accent/50` for interactive rows.

## 6. Verification
- **Test**: Scroll content behind the Sidebar/Player. It should be blurrily visible.
- **Test**: Switch Dark/Light mode. Colors should adapt instantly.
- **Check**: Open a dropdown. It should look "glassy" and saturated.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/design-system/index.mdx`.
- Update `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
