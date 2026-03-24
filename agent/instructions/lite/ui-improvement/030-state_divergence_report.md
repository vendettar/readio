# State Divergence Audit Report (030)

This report documents the gap analysis between the current route implementations in Lite and the [State Precedence Matrix](./030-state_precedence_matrix.md). 

## 1. Divergence Table

| Route | Audit Status | Matrix Divergence | Actionable Fix |
| :--- | :--- | :--- | :--- |
| **Search** | ✅ **Baseline** | None. Standardized for revalidation persistence and localized a11y. | None. |
| **History** | ❌ **High** | **Revalidation Blanking**: Content hidden via `!isLoading` gate during refreshes. | Decouple populated list visibility from the `isLoading` flag. |
| **Favorites** | ❌ **High** | Similar to History. Content is gated by `!isInitialLoading`. | Decouple visibility from loading state; preserve stale content. |
| **Downloads** | ❌ **High** | Loading UI was upgraded to shared skeletons, but populated tracks are still fully gated behind `loading === false`, causing revalidation blanking. | Preserve rendered tracks during background refresh and limit skeleton usage to true initial-empty loads. |
| **Explore** | 🟡 **Minor** | Good partial loading but uses some hardcoded fallback strings. | Sync `offline` banners with global translation keys (i18n). |

## 2. Shared Regression Pattern: "Revalidation Blanking"

The most significant violation across the **Library Route Family** (History, Favorites, Downloads) is the use of blocking loading logic. 

**Standard Requirement:**
- If items already exist in the store/DB, they **must** remain visible.
- Loading treatments (Skeletons/Spinners) should be layers or specific to empty initial boots, not background refreshes.

**Current Violation Example (HistoryPage.tsx):**
```tsx
// VIOLATION: Page goes blank every time a refresh starts
{!isLoading && sessions.length === 0 && ( ... )} // Shows empty only when NOT loading
{!isLoading && sessions.length > 0 && ( ... )}   // Shows list only when NOT loading
```

**Current Status Note:**
- `Search` has already moved to the required stale-while-revalidate model.
- `Downloads` has improved loading presentation quality, but not yet loading precedence.
- The remaining priority is the **Library Route Family** state gating, not shell/header cosmetics.

## 3. Actionable Fix Plan

To reach full `030` compliance, the implementation must be updated to follow the **Stale-While-Revalidate (SWR)** presentation model:

1. **Decouple Populated Lists**: Change render gates from `!isLoading && items.length > 0` to simply `items.length > 0`.
2. **Unified Geometric Skeletons**: Ensure `History`, `Favorites`, and `Downloads` use the shared `EpisodeListSkeleton` with localized `label` props.
3. **Layered Loading**: For these library routes, skeletons should appear only when there is no usable content yet. Background refreshes should show existing content plus a lighter loading/degraded treatment if needed.
4. **Continuous Shell**: Verify `PageShell` and `PageHeader` never unmount or "jump" during these state transitions.
5. **i18n Sync**: Replace remaining hardcoded fallback copy in `Explore` offline messaging with committed locale keys rather than route-local English defaults.

---
*Created on 2026-03-16 following a baseline audit of route components.*
