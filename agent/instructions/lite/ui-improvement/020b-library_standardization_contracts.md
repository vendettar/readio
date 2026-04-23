# Library UI Standardization Contract Summary (Lite)

This document is a working synthesis reference for the Library Route Family (`History`, `Favorites`, `Files`, `Downloads`).

It summarizes:
- the **State Precedence Matrix (030)** for route-state behavior
- the **List Surface Divergence Table (020)** for populated-surface behavior

It does **not** replace:
- agent/instructions/lite/ui-improvement/030-state_precedence_matrix.md
- the active `020` instruction and its divergence artifacts

If this summary conflicts with those source documents, the source documents win.

---

## 1. State Precedence Matrix (030)
*Governs how the route responds to loading, empty, error, and offline signals.*

### Global Precedence Resolution
1. **Full Error**: Initialization failed; no usable content exists.
2. **Initial Loading**: No usable content exists yet; blocking load in progress.
3. **Offline-Degraded (Internal Empty)**: Offline with no cached/stale content.
4. **Partial-Data / Stale-Content (SWR)**: Content is visible while revalidating or sections fail.
5. **Empty**: Load complete; genuinely no usable content.
6. **Populated**: Normal content is available and usable.

### Route-Specific State Rules
| Route Cluster | Loading Pattern | Empty Pattern | SWR Pattern |
| :--- | :--- | :--- | :--- |
| **Library** (`Hist/Fav/DL`) | Layout-preserving `EpisodeListSkeleton` | Shared `EmptyState` family | Preserve prior content + revalidation indicator |
| **Files** | Layout-preserving `FileManagementSkeleton` | Shared `EmptyState` + ingest focus | Preserve prior content |
| **Search** | Shell-preserving loading | Search-specific `EmptyState` | Keep prior results mounted while fetching |
| **Explore** | Section skeleton family | Shared `EmptyState` + offline banner | Section-level fallback; keep usable sections |

---

## 2. List Surface Divergence Table (020)
*Governs the visual and structural "rhythm" of populated lists and cards.*

### Shared Base Surface Contract
| Feature Area | Standard Pattern | Reviewer-Verifiable Expectation |
| :--- | :--- | :--- |
| **Trailing Action Rail** | Fixed visual lane, vertically centered, right-aligned. | Actions should not drift route-by-route or compress the text block unpredictably. |
| **Hover Treatment** | Semantic-token hover surface only. | Hover should be visible without introducing raw-color or route-local palette drift. |
| **Focus Treatment** | Explicit keyboard-visible focus styling layered on the shared row surface. | Keyboard users must retain a stable, obvious focus state. |
| **Primary Metadata** | Title-first hierarchy with controlled truncation/clamping. | Reviewer should be able to identify one dominant text block and one secondary metadata zone. |
| **Secondary Metadata Rhythm** | Secondary metadata may use separators or equivalent compact grouping, but the pattern must stay consistent within the family. | Secondary metadata should read as one coordinated row/zone, not ad hoc fragments. |

### Justified Divergences
| Feature Area | Default Baseline (`History` / `Favorites`) | `Downloads` Justification | `Files` Justification | Forbidden Divergence |
| :--- | :--- | :--- | :--- | :--- |
| **Density Variants** | Comfortable default | Comfortable / Compact toggle justified by management density | Comfortable / Compact toggle justified by file-management density | Route-only density names or unrelated spacing scales |
| **Vertical Rhythm** | Shared default row rhythm | Density-aware mapping within shared token scale | Density-aware mapping within shared token scale | Arbitrary per-page padding not traceable to shared density tokens |
| **Subtitle/Version** | None | Summary-first, read-only subtitle/version signal | Rich inline subtitle/version management | Downloads gaining Files-level manager complexity, or Files collapsing to summary-only control |
| **Metadata Rows** | Playback-oriented metadata | Download-oriented metadata | File-management metadata | Route-local metadata sprawl that breaks the shared primary/secondary hierarchy |

---

## 3. Implementation Checklist & Regression Anchors

1. **Shell Continuity**: `PageShell` and `PageHeader` must never unmount during state switches.
2. **No Blanking**: `Populated` state must never regress to `Initial Loading` during background revalidation (SWR).
3. **Density Safety**: `comfortable` and `compact` padding must be shared via tokens, not hardcoded per page.
4. **Action visibility**: Tray menus and buttons must be visually aligned across the library family even if actions differ.

---
> [!IMPORTANT]
> This document is a contract summary for quick alignment, not the sole source of truth. Any deviations found during implementation or review must be reconciled against the underlying `020` / `030` source documents or mapped back to a specific product job requirement.
