# State Precedence Matrix (Lite Standardization)

This document defines the reviewable route-state presentation contract required by `agent/instructions/lite/ui-improvement/030-loading-empty-error-state-standardization.md`.

It is a state-presentation artifact, not a data-semantics redesign. The goal is to make route-state precedence explicit enough that implementation and review do not rely on implicit `if/else` ordering in route components.

## 1. Shared State Primitives

| Primitive | Contract Use | Geometry Requirement |
| :--- | :--- | :--- |
| `PageShell` | Route layout root | Must remain mounted during all route states except full app crash |
| `PageHeader` | Header contract from `010` | Must remain visible during all route states unless the app shell itself is unavailable |
| `RouteSkeleton` | Layout-preserving loading treatment | Preferred when final route geometry is predictable |
| `LoadingPage` | Full-route blocking loading | Allowed only when final route geometry is not yet meaningfully knowable |
| `EmptyState` | Standard empty/prompt/degraded-empty family | Must preserve shell/header geometry |
| `ErrorState` | Full-route failure state with recovery | Must present clear recovery intent |
| `OfflineBanner` | Inline degraded warning while route remains usable | Must not replace usable content by itself |
| `InlineSectionFallback` | Section-scoped loading/error/degraded treatment | Used when the route remains partially usable |

## 2. Global Precedence Resolution

When multiple route-state signals are true, resolve in this order unless a route-specific matrix explicitly narrows a case:

1. **Full Error**
   - Critical route initialization failed
   - No usable cached/local/stale content exists
2. **Initial Loading**
   - No usable content exists yet
   - A blocking fetch/load is in progress
3. **Offline-Degraded With No Usable Content**
   - Route is offline/unreachable
   - No usable populated or partial content is available
4. **Partial-Data / Stale-Content**
   - Some content is already usable
   - Other sections are loading, failed, or offline-degraded
   - Stale or retained content remains visible during revalidation
5. **Empty**
   - Fetch/load is complete
   - No usable content exists
   - This is a true empty result, not a transient loading or degraded state
6. **Populated**
   - Normal route content is available and usable

### Global Combination Rules

- `offline + cached/stale/populated content` => do **not** collapse to a full-route offline state; render `Partial-Data / Stale-Content` with degraded messaging.
- `initial loading + retained prior content` => do **not** show full-route blocking loading; keep content visible and treat as `Partial-Data / Stale-Content`.
- `section failure + remaining content usable` => do **not** escalate to `Full Error`; use section-level fallback while preserving route usability.
- `empty + offline` => only show a degraded empty state if the route genuinely has no usable content; do not treat all offline states as empty.

## 3. Route-Specific Matrices

## A. Library Route Family

Applies to:
- `History`
- `Favorites`
- `Downloads`

These routes should share one base state contract. `Downloads` may retain route-specific CTA copy, but not a different state family.

| State | Entry Signal | Precedence | Presentation Pattern | Geometry |
| :--- | :--- | :---: | :--- | :--- |
| Initial Loading | No usable items yet and initial route load in progress | 1 | Layout-preserving route skeleton | Preserve shell + header |
| Empty | Load complete and item collection is empty | 2 | Shared `EmptyState` family with route-specific CTA/copy if justified | Preserve shell + header |
| Populated | One or more items available | 3 | Standard populated list/card surface | Standard |

### Library Route Rules

- `Downloads` must not keep plain-text loading or a custom empty-state family outside the shared contract.
- `History` and `Favorites` may keep different empty-state copy, but not different structural composition.
- If route-local retained content exists during refresh, preserve visible content and treat it as `Populated` or `Partial-Data`, not `Initial Loading`.

## B. Files Route

`Files` belongs to the same shell/state family but is allowed one justified divergence: the empty state may foreground ingest/import affordances more strongly than the library routes.

| State | Entry Signal | Precedence | Presentation Pattern | Geometry |
| :--- | :--- | :---: | :--- | :--- |
| Initial Loading | Route file tree is initializing and no usable folders/tracks are visible | 1 | Layout-preserving file-management skeleton | Preserve shell + header |
| Empty | File tree resolved with no folders/tracks | 2 | Shared `EmptyState` family with file-ingest CTA emphasis | Preserve shell + header |
| Populated | Any folders or tracks visible | 3 | Standard file-management surface | Standard |

### Files Rules

- The empty state may visually emphasize upload/drop/import, but it still belongs to the shared `EmptyState` family.
- Do not encode this route as a separate “dropzone-only state system.”

## C. Search Route

Search is query-bound and must distinguish prompt, loading, empty, partial, and populated states without collapsing shell geometry.

| State | Entry Signal | Precedence | Presentation Pattern | Geometry |
| :--- | :--- | :---: | :--- | :--- |
| Idle Prompt | No query submitted yet | 1 | Shared `EmptyState` family used as search prompt | Preserve shell + header |
| Initial Loading | Query exists, no usable results yet, request in flight | 2 | Route-shell-preserving loading pattern for search | Preserve shell + header |
| Degraded / Partial | Query exists, prior or partial results remain visible while revalidating or some sections/providers fail | 3 | Visible results remain mounted, with inline degraded/error treatment as needed | Preserve shell + header |
| Empty | Query exists, request resolved, and no results found | 4 | Shared `EmptyState` family for no-results outcome | Preserve shell + header |
| Populated | Query exists and usable results are available | 5 | Standard search results surface | Standard |

### Search Rules

- Do not use a full-route blocking pattern if prior results remain visible during revalidation.
- If `LoadingPage` is used, it must still satisfy the shell/header continuity rule; otherwise use a shell-preserving route loading pattern instead.
- `no query` is an explicit idle prompt state, not an error and not a loading state.

## D. Explore Route

Explore is the most complex route because it can remain useful with partial or stale content.

| State | Entry Signal | Precedence | Presentation Pattern | Geometry |
| :--- | :--- | :---: | :--- | :--- |
| Full Error | Critical route initialization failed and no usable section content exists | 1 | Full-route `ErrorState` with recovery intent | Preserve shell + header |
| Initial Loading | No usable section content exists and initial route load is in progress | 2 | Explore hero + section skeleton family | Preserve shell + header |
| Offline-Degraded Empty | Offline/unreachable and no usable cached/retained section content exists | 3 | Degraded empty-state family plus offline messaging | Preserve shell + header |
| Partial / Degraded Populated | Any section content is usable while other sections are loading, failed, or offline-degraded | 4 | Preserve visible sections, use inline section fallbacks/banner messaging for degraded areas | Preserve shell + header |
| Populated | Route content is available without degraded branches | 5 | Standard Explore content surface | Standard |

### Explore Rules

- `offline` by itself must not outrank already-usable content.
- Cached or retained section content must remain visible when possible.
- Section failure must be expressed as section-level fallback if the route remains useful.
- Do not collapse Explore into an all-or-nothing state model.

## 4. Route-State Implementation Rules

1. **Shell Continuity**
   - `PageShell` and `PageHeader` must remain mounted during all route states covered by this matrix.
2. **No Geometry Jumps**
   - Skeletons should approximate final route geometry closely enough to avoid obvious vertical collapse/expansion.
3. **No Hidden Precedence**
   - Route components must not rely on undocumented condition ordering.
   - If implementation introduces a new combination branch, this matrix or the durable SSOT doc must be updated.
4. **Accessible State Announcements**
   - Loading and transitional state containers should use `aria-busy="true"` and/or `aria-live="polite"` where appropriate.
   - Empty and error outcomes must be announced with meaningful, route-specific copy.
5. **Business-Semantics Preservation**
   - This matrix governs presentation only.
   - It must not redefine routing, fetch policy, persistence semantics, or action behavior.

## 5. Mandatory Reviewer Checks

Reviewer should confirm:
- state precedence is implemented as documented, not inferred
- `offline + usable content` does not collapse to a blank degraded route
- `revalidation + retained content` does not regress to full-route blocking loading
- library-route empty/loading states share one family contract
- `Files` keeps only justified divergence, not a separate state system

## 6. Localization Note

All new or changed user-facing state copy must remain fully localized, including Chinese counterparts where the touched docs or runtime strings require bilingual sync.
