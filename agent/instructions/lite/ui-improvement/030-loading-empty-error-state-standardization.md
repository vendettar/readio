# Task: Loading Empty Error State Standardization

## Goal
Define and implement one explicit route-state presentation contract for Lite’s state-heavy pages so `Explore`, `Search`, `Files`, `Downloads`, `History`, and `Favorites` present loading, empty, error, partial-data, and offline-degraded states consistently and reviewably without changing route business logic or absorbing populated-list/header work.

## Status
- [ ] Active
- [ ] Completed

## Recommended Order
1. Execute after `ui-improvement/010-page-shell-and-header-contract.md`.
2. Execute before `ui-improvement/020-library-list-surface-unification.md`.

## Depends On
- `agent/instructions/lite/ui-improvement/001-ui-improvement-roadmap.md`
- `agent/instructions/lite/ui-improvement/010-page-shell-and-header-contract.md`

## Can Run In Parallel
- No with `020` on the same route files.
- No with any route-state cleanup that touches the same pages.
- Yes with unrelated discovery-detail or overlay work outside these state models.

## Read First (Required)
- `apps/docs/content/docs/index.mdx`
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/general/accessibility.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/standards.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
- relevant route components for `Explore`, `Search`, `Files`, `Downloads`, `History`, `Favorites`

## Phase Boundary (Strict)
This is a Phase 2 state-presentation task.

It may:
- define loading / empty / error / partial-data / offline-degraded presentation rules
- define when to use `LoadingPage`, route-local skeletons, inline loaders, and `EmptyState`
- preserve shell/header geometry during state transitions
- standardize state wording/composition patterns where needed

It may not:
- redefine the page shell/header contract from `010`
- redefine populated row/list/card rules from `020`
- redefine overlay/focus/layering behavior from `040`
- change fetch timing, query keys, cache TTL, or route business semantics except where the contract requires clearer state gating

## Problem
State-heavy pages currently mix several presentation patterns:
- full-page spinner (`LoadingPage`)
- route-local skeletons
- plain text loading placeholders
- ad hoc empty blocks
- special offline branches

The result is inconsistent geometry, unpredictable state transitions, and unclear guidance for future routes.

## Current Contract
- `Explore` uses rich route-local skeletons and an offline branch.
- `Search` uses `LoadingPage` and `EmptyState`, but the transitions are not documented as the route standard.
- `History` and `Favorites` rely on `LoadingPage` plus `EmptyState`.
- `Files` uses a route-specific skeleton set for initial loading.
- `Downloads` still uses a plain loading text block and custom empty block.

## Target Contract
Each in-scope route must map its route states to one documented presentation matrix that specifies:
- loading
- empty
- error
- partial-data
- offline-degraded
- populated

The contract must define not only which component to render, but also when to preserve final layout geometry and when a full-page centered state is acceptable.

## Delta
- Replace route-local state heuristics with one documented state matrix.
- Eliminate ad hoc text-only loading and empty blocks where a shared pattern should apply.
- Make offline-degraded behavior explicit instead of route-local convention.

## Scope

### In Scope
- `apps/lite/src/routeComponents/ExplorePage.tsx`
- `apps/lite/src/routeComponents/SearchPage.tsx`
- `apps/lite/src/routeComponents/FavoritesPage.tsx`
- `apps/lite/src/routeComponents/HistoryPage.tsx`
- `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
- `apps/lite/src/routeComponents/DownloadsPage.tsx`
- shared loading, skeleton, and empty-state primitives used by these routes

### Out of Scope
- page-header contract
- populated list/card contract
- command palette state handling
- transcript/player state handling
- discovery detail route redesign
- network/cache strategy changes

## Product Decisions (Locked)
1. This task standardizes presentation, not data semantics.
2. Existing business behavior must be preserved unless the state contract exposes a correctness issue.
3. Layout-preserving skeletons are preferred for list/grid routes whose final geometry is predictable.
4. Full-page centered loading remains allowed only where the final route geometry is not yet knowable or the route genuinely behaves like a blocking transition.

## Scope Scan (8 Scopes)
- Config & env parsing:
  - No config/env change.
- Persistence & data integrity:
  - No storage change.
- Routing & param validation:
  - No route contract change.
- Logging & error handling:
  - Error-display contract may change visually; logging path does not.
- Network & caching:
  - No fetch/caching policy change.
- Storage & serialization:
  - No storage/serialization change.
- UI state & hooks:
  - Route-state derivation may be simplified or documented but must stay route-owned.
- Tests & mocks:
  - Add/update tests for route-state presentation branches and geometry preservation where relevant.

## Hidden Risk Sweep
- Async control flow:
  - Do not accidentally introduce duplicate loading gates that fight each other.
  - Avoid overlapping “loading + empty” flashes by documenting exact precedence.
- Re-entrancy:
  - Retry buttons and navigation CTAs must remain deterministic and route-owned.
- Hot-path performance:
  - Skeleton trees should preserve geometry without excessive duplicate render weight.
- Cache drift:
  - Do not reinterpret stale data as empty state where partial-data is the correct branch.

## Dynamic Context Consistency
The state matrix must cover:
- offline remote routes with local fallbacks
- translated empty/error text growth
- narrow screens where empty-state CTAs stack
- partial-data cases where some sections load while others already have data

## Required Changes

### 1. Define one route-state matrix
Document and implement a matrix covering:
- loading
- empty
- error
- partial-data
- offline-degraded
- populated

For each in-scope route, specify:
- the entry condition
- the presentation component/pattern
- whether header/shell geometry remains visible
- what CTA or fallback is shown, if any
- the explicit precedence order when multiple state signals are simultaneously true

This matrix must exist in a reviewable artifact during implementation:
- either as a dedicated section added to this instruction while active, or
- in the relevant Lite handoff/UI-pattern doc if that doc becomes the durable SSOT

Do not leave state precedence implicit in component condition ordering alone.

Minimum template for the state matrix (one per route):
| Route | State Signal(s) | Precedence | Presentation | Header/Shell Visible | CTA/Fallback |
| --- | --- | --- | --- | --- | --- |
| Files | loading + no cached data | 1 | route skeleton | yes | none |
| Files | offline + cached data | 2 | inline offline banner | yes | retry |

### 2. Standardize loading presentation rules
- Use structured skeletons when final layout geometry is known and users benefit from continuity.
- Use `LoadingPage` only when full-page blocking is actually the intended route behavior.
- Remove plain loading text placeholders where a documented shared pattern should exist.
- **Ensure dynamic loading and empty/error state containers use `aria-busy="true"` or `aria-live="polite"` where appropriate so screen readers announce the route state transition.**

### 3. Standardize empty-state composition
- Empty states must use a documented structure:
  - icon
  - title
  - description
  - primary CTA when a meaningful next step exists
- Empty-state composition must remain consistent across library routes unless the product clearly requires a different fallback.

### 4. Standardize error and partial-data handling
- Error presentation must distinguish between:
  - full-route failure
  - section failure with other content still present
- Partial-data routes like `Explore` must not collapse into a binary “all-or-nothing” model if sections can render independently.
- The contract must define whether stale or already-loaded content remains visible during section revalidation.
- The contract must explicitly resolve ambiguous combinations such as:
  - offline + stale cached content
  - initial loading + retained prior content
  - section error + still-usable route shell
  - empty result + degraded/offline state

### 5. Standardize offline-degraded handling
- The contract must say when offline status becomes:
  - a banner/warning within a still-usable route
  - an alternate empty/degraded route state
- `Explore` and `Search` must document how remote absence and local fallback behave offline.
- Library routes must not show remote-oriented messaging where the route remains locally usable.

### 6. Preserve business semantics
- Do not change search result selection, playback behavior, file/drop behaviors, or history/favorites logic.
- Do not introduce new repository/store contracts.

### 7. Update durable docs if the matrix becomes SSOT
If a durable route-state contract is established, update:
- `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx`
- `apps/docs/content/docs/apps/lite/ui-patterns/features.mdx`
- relevant handoff feature docs for discovery/search/files/history

## Exit Criteria
1. Every in-scope route has a documented state matrix with explicit precedence.
2. All loading/empty/error/partial/offline branches use the shared patterns defined by the contract.
3. No route uses ad hoc text-only loading placeholders.
4. The route-state matrix is stored in a reviewable artifact and linked from this instruction or SSOT docs.

## Evidence
- Updated matrix tables (with route-by-route precedence).
- Screenshots or test evidence for at least one route per state type (loading, empty, error, partial, offline).

## Forbidden Patterns
- No populated-list cleanup folded into this task.
- No header/shell redesign folded into this task.
- No undocumented state precedence.
- No plain text “Loading...” placeholders on routes that should have structured skeletons.
- No generic “something went wrong” state without route-specific recovery intent where recovery is possible.

## Acceptance Criteria
1. Each in-scope route has an explicit, reviewable state matrix.
2. `Files`, `Downloads`, `History`, and `Favorites` no longer drift in loading/empty-state presentation without documented reason.
3. `Explore` and `Search` define offline-degraded and partial-data behavior explicitly.
4. Skeletons preserve route geometry where appropriate.
5. The task does not redefine headers, populated list surfaces, or overlay semantics.

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- in-scope route components
- shared skeleton / empty / loading primitives touched by the work
- any docs updated in Lite `ui-patterns` / handoff files

### Adjacent Critical Files (Spot Check)
- `apps/lite/src/components/ui/empty-state.tsx`
- `apps/lite/src/components/ui/loading-spinner.tsx`
- `apps/lite/src/components/Files/FilesLoadingSkeletons.tsx`
- any `Explore` skeleton components touched

### Mandatory Regression Anchors
- `Explore` offline degradation
- `Search` no-query / no-result / loading transitions
- `Files` initial loading geometry
- `Downloads` replacement of plain loading/empty blocks with contract-compliant states

## Required Tests
- Add/update tests that verify:
  - state precedence for each route branch
  - offline-degraded route behavior for `Explore`/`Search`
  - structured skeleton presence where required
  - consistent empty-state composition for library routes

## Manual Verification
1. Check `Explore` online, offline, and partial-content states.
2. Check `Search` with no query, loading, no result, and result states.
3. Check `Files`, `Downloads`, `History`, and `Favorites` initial loading and empty states.
4. Verify no abrupt shell collapse between states.

## Verification Commands
- `pnpm --filter @readio/lite lint`
- `pnpm --filter @readio/lite typecheck`
- `pnpm -C apps/lite test:run`

## Decision Log
- Required if this task changes a durable route-state presentation policy.
- Otherwise waived.

## Bilingual Sync
- Not applicable for the instruction file itself.
- Required for any touched handoff docs with `.zh.mdx` counterparts.

## Completion
- Completed by:
- Reviewed by:
- Commands:
- Notes:
