> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Implement Shared Element Transitions

## Objective
When clicking an episode or expanding the player, the artwork should morph smoothly from one location to another (Spatial Metaphor).

## 1. Identify Shared Elements
- **Source**: `apps/lite/src/components/AppShell/MiniPlayer.tsx` -> Artwork.
- **Target**: `apps/lite/src/components/AppShell/FullPlayer.tsx` -> Artwork.
- **Source**: `apps/lite/src/components/Explore/EpisodeRow.tsx` -> Artwork.

## 2. Apply `layoutId`
- **Action**: Wrap the Artwork `<img>` (or `InteractiveArtwork`) with `<motion.div>`.
- **Prop**: `layoutId={\`artwork-${episodeId}\`}` (ensure unique ID).
- **Logic**: Ensure the ID is consistent across views.

## 3. Handle Navigation
- **Strategy**: Since `FullPlayer` is a Global Overlay (always mounted or portaled), we do NOT need `AnimatePresence` for route transitions.
- **Implementation**: Ensure `MiniPlayer` remains in the tree (potentially hidden via opacity) while `FullPlayer` expands, allowing Framer Motion to detect both `layoutId` nodes and interpolate.

## 4. Verification
- **Test**: Click "Expand" on Mini Player. Artwork should grow to Full Player size.
- **Test**: Click "Play" on a list item. If it transitions to a player view, artwork should fly there.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
