> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Integrate React Bits (Animations)

## Objective
Enhance the "Vibe" of Readio by introducing subtle, high-quality animations using Framer Motion and React Bits patterns.
Focus on "Animated List" (for Episode Lists) and "Count Up" (for Storage Usage in Settings).

## 1. Install Library
- **Note**: `framer-motion` is already installed (Instruction #005).
- **Action**: Ensure `src/components/bits/` directory exists.

## 2. Create `src/components/bits/AnimatedList.tsx`
- **Source**: Based on React Bits "Animated List".
- **Props**: `children`, `className`, `delay?`.
- **Implementation**:
  - Use `<AnimatePresence>` and `<motion.div>`.
  - Use `variants` for stagger effect (`visible`, `hidden`).
  - **Performance**: Use `layout` prop carefully (only if reordering).

## 3. Create `src/components/bits/CountUp.tsx`
- **Source**: Based on React Bits "Count Up".
- **Props**: `to`, `from?`, `duration?`.
- **Implementation**:
  - Use `useSpring` and `useTransform` from `framer-motion` to animate the number value.
  - Render it as a `motion.span`.

## 4. Integrate Animations
- **Target**: `apps/lite/src/routeComponents/SettingsPage.tsx` (Storage Usage).
- **Action**: Wrap the storage number (e.g. "120 MB") with `<CountUp to={120} />`.
- **Target**: `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`.
- **Action**: Wrap the grid items in `<AnimatedList>`.

## 5. Verification
- **Test**: Open Settings. The number should count up smoothly.
- **Test**: Navigate to Explore. The grid items should cascade in (staggered).

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.