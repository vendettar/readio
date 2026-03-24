> **⚠️ CRITICAL**: Preserve current UI/UX layout and styling. This task is about bandwidth/perf, not a visual redesign.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/standards.mdx` (InteractiveArtwork section) before starting.

# Task: Fix InteractiveArtwork Image Sizing Ownership (Option B)

## Objective
Eliminate unintended image upscaling (e.g. callers request 200/400 but requests become 600) by making **`InteractiveArtwork` the single owner** of artwork URL normalization and sizing.

## Problem Statement
`InteractiveArtwork` currently calls `getDiscoveryArtworkUrl(effectiveSrc)` with the helper default size (600). If callers already pass a pre-sized URL (e.g., `getDiscoveryArtworkUrl(url, 200)`), `InteractiveArtwork` re-normalizes it and upgrades to 600, increasing bandwidth and defeating caller intent.

## Scope Scan (8 Scopes)
- **Config**: No config changes.
- **Persistence**: No DB/storage schema changes.
- **Routing**: No route changes.
- **Logging**: No logging changes required.
- **Network**: YES (image request URLs / bandwidth). Ensure no cache-busting or URL churn is introduced.
- **Storage**: No changes.
- **UI State**: YES (image loading placeholder state). Must not regress loading/fallback behavior.
- **Tests**: YES. Add/adjust a regression test to prevent re-introducing 600px upscaling in list contexts.

## Hidden Risk Sweep
- **Hot path**: Episode lists and grids re-render frequently; avoid expensive parsing per render. `getDiscoveryArtworkUrl` is cheap, but do not add heavy logic inside render loops.
- **Async flow**: Ensure image fallback error handling remains stable; do not introduce re-entrancy loops on `onError`.

---

## Required Pattern (Option B)
1. **Callers pass raw provider URLs** (e.g., `artworkUrl100`, `artworkUrl600`, RSS image URL).  
   - **Forbidden**: Callers must NOT pre-size with `getDiscoveryArtworkUrl(...)` before passing into `InteractiveArtwork`.
2. **`InteractiveArtwork` normalizes the URL exactly once**, using a deterministic resolved pixel size.
3. **Escape hatch**: `InteractiveArtwork` accepts an optional `imageSize?: number` for cases where `size` is not representative of the final rendered dimension (e.g., `className="w-full h-full"` cards).

## Design Notes (Bandwidth Budget)
- **Default `xl` pixel size**: Keep `xl=200` as the default list/grid budget. For retina displays, `xl` could be increased to `300` or `400` in the future, but only based on measured bandwidth + render performance impact (not aesthetics).
- **Evolution Rule**: Any change to the size map must include:
  - A brief perf note (expected bandwidth delta),
  - A before/after DevTools Network snapshot (or equivalent evidence),
  - Re-run `pnpm --filter @readio/lite build` once at the end (to ensure no accidental regressions in the PWA pipeline).

## PWA Manifest Hygiene (Icon Sync)
- **Single Source of Truth**: `VitePWA({ manifest: { icons } })` is the source of truth for icons.
- **Public Asset Drift**: Periodically audit `apps/lite/public/` for unused PWA icon assets and remove dead files to prevent drift and accidental references.
- **Forbidden**: Do not maintain a hand-edited `apps/lite/public/manifest.json` alongside `manifestFilename` output; this creates deploy-time mismatches.

---

## Implementation Steps (Coder)

### 1) Fix `InteractiveArtwork` sizing semantics
**File**: `apps/lite/src/components/interactive/InteractiveArtwork.tsx`

- Add prop: `imageSize?: number`.
- Define a mapping from `size` to pixel size, e.g.:
  - `sm -> 100`
  - `md -> 160`
  - `lg -> 200`
  - `xl -> 200` (or `240` if you prefer; must be consistent with list usage)
- Resolve actual size:
  - `const resolvedImageSize = imageSize ?? sizeToImageSize[size]`
- Normalize once:
  - `const primaryUrl = effectiveSrc ? getDiscoveryArtworkUrl(effectiveSrc, resolvedImageSize) : undefined`
  - `const fallbackUrl = fallbackSrc ? getDiscoveryArtworkUrl(fallbackSrc, resolvedImageSize) : undefined`
- Remove the duplicate declaration:
  - There are currently two identical lines: `const effectiveSrc = blobUrl || src` (keep one).

### 2) Update all `InteractiveArtwork` call sites to stop pre-sizing
Replace call-site `getDiscoveryArtworkUrl(...)` usage with raw URLs, and (when needed) pass `imageSize`.

**Must audit and update at least these files**:
- `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
- `apps/lite/src/components/EpisodeRow/EpisodeRow.tsx`
- `apps/lite/src/components/PodcastCard/PodcastCard.tsx`
- `apps/lite/src/routeComponents/FavoritesPage.tsx`
- `apps/lite/src/components/GlobalSearch/SearchResultItem.tsx`
- `apps/lite/src/components/GlobalSearch/CommandPalette.tsx`
- `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
- `apps/lite/src/routeComponents/HistoryPage.tsx` (ensure it doesn’t accidentally re-normalize non-Apple URLs)

**Specific rule**:
- For `PodcastCard`, because it uses `className="w-full h-full"` while `size` defaults to `md`, it MUST pass `imageSize={imageSize}` (existing prop) into `InteractiveArtwork` after the refactor.

### 3) Regression Test (Required)
Add a test that fails if `InteractiveArtwork` inflates a pre-sized Apple URL to 600 in list contexts.

Minimal acceptable test:
- Render `InteractiveArtwork` with:
  - `src="https://.../200x200bb.jpg"`
  - `size="md"` and `imageSize={200}`
- Assert rendered `<img src>` contains `200x200bb` (and NOT `600x600bb`).

If you prefer not to add a component test, extract a tiny pure helper (e.g. `resolveArtworkSrc(url, imageSize)`), test that function, and keep component logic thin.

---

## Documentation Updates (Required)
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx` and `.zh.mdx`:
  - Clarify: `InteractiveArtwork` owns URL sizing; callers pass raw URLs and may use `imageSize` escape hatch.

## Verification (Zero-Warning Policy)
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite test:run`

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-01-29
- **Reviewed by**:

## Patch Additions (Integrated)
# Patch: 050a-fix-interactiveartwork-image-sizing

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
- No layout shift regression test.
