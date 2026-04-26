# Instruction 007: Cloud Discovery Content Route State Type Extraction

Extract a shared content-route type that explicitly models which podcast content routes may carry typed route `state`, so UI layers no longer need to locally wrap route unions just to preserve editor-pick bootstrap context.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: Medium
- **Owner Stream**: Cloud UI discovery route typing / content-route state hygiene
- **Depends on**: Instruction 004 and Instruction 029 established the current content-route identity and editor-pick bootstrap contracts

## 2. Constraint Check

- Current intended route contract
  - show route = `/podcast/$country/$id`
  - episode detail route = `/podcast/$country/$id/$episodeKey`
  - episodes list route = `/podcast/$country/$id/episodes`
- Current intended identity contract
  - show identity = canonical `podcastItunesId`
  - episode route identity = canonical `episodeGuid` encoded as compact key
- Current intended route-state contract
  - `editorPickSnapshot` is bootstrap-only route context
  - route `state` is not a generic metadata bucket
  - route `state` must not weaken canonical route identity rules
- This instruction is type-contract cleanup only. It must not change runtime navigation behavior.

## 3. Problem Statement

Current content-route typing has a local mismatch:

1. shared route builders in `podcastRoutes.ts` model route shape precisely
2. some UI consumers, especially episode rows, need to preserve typed `state` for editor-pick bootstrap
3. because shared route types do not expose a state-aware content-route variant, UI code wraps the route types locally
4. that local wrapping can drift from the shared route contract and weakens type clarity around which routes actually permit state

The result is not a runtime bug today, but it is a maintainability smell:

- route type truth is split between shared route helpers and local UI types
- future route-contract changes can silently desync from local wrappers
- reviewers have to re-derive whether `state` support is intentional or accidental

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Shared route typing should explicitly model allowed state-bearing content routes | Avoid local wrapper drift |
| D2 | Only content routes that actually need bootstrap state should carry typed `state` | Prevent `state` from becoming a blanket property on all route objects |
| D3 | `editorPickSnapshot` remains bootstrap-only typed context, not canonical route identity | Preserve current product contract |
| D4 | This refactor must not widen route builders back to generic `{ to: string; params: Record<string, string> }` objects | Keep precise typed navigation |
| D5 | Runtime behavior must stay identical before and after the refactor | This is a type-boundary cleanup, not a navigation redesign |

## 5. Affected Methods / Types

- `apps/cloud-ui/src/lib/routes/podcastRoutes.ts`
  - `PodcastShowRouteObject`
  - `PodcastEpisodeRouteObject`
  - `PodcastEpisodesRouteObject`
  - `PodcastRouteObject`
- `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
  - `EpisodeRowModelRoute`
- any nearby content-route consumer currently adding `state` locally to shared route types

## 6. Required Changes

### Scope Boundary

This instruction owns:

- shared type extraction for state-bearing podcast content routes
- replacing local UI wrappers with the shared extracted type where appropriate
- keeping `editorPickSnapshot` typed and explicit

This instruction does not own:

- route behavior changes
- route identity changes
- search/top-episode clickthrough policy
- adding new route-state payloads
- making every podcast route builder state-aware

### A. Extract a shared typed route for state-bearing content routes

Add a shared type in `podcastRoutes.ts` or a tightly related route-typing module that explicitly models:

- which content routes may carry typed `state`
- what that `state` shape is

Recommended first step:

- keep the existing route object types precise
- define a narrow shared union such as:
  - show content route with optional typed bootstrap state
  - episode content route with optional typed bootstrap state

Do not include unrelated route families unless they already need this state in production.

### B. Replace local UI re-wrapping with the shared type

Review `EpisodeRowModelRoute` and any nearby local wrappers.

Required outcome:

- local UI types should consume the shared extracted type
- UI layers should stop redefining their own “route plus state” union when the shared route layer can state it directly

### C. Keep `state` narrow and intentional

The extracted shared type must not turn `state` into a generic escape hatch.

Required rules:

- `state` stays optional
- `state` is typed, not `unknown` or `any`
- `state` is limited to the currently owned bootstrap context
- route builders must not accept arbitrary state payloads just because the route object type can carry state later at navigation time

### D. Must Not Regress

- No runtime navigation behavior changes
- No weakening of canonical route `to` / `params` types
- No conversion back to stringly typed route helpers
- No broadening of `PodcastRouteObject` into “everything can have everything”
- No new compatibility layer for old route identities

### E. Recommended Design Shape

Prefer one of these two patterns:

1. add a narrow shared type like `PodcastContentRouteWithState`
2. add a generic helper type like `WithRouteState<T, S>` but only if it stays readable and is used narrowly

Preferred default:

- explicit named shared content-route type

Reason:

- it documents intent better than a generic utility when the current use case is still narrow

### F. Tests To Update

Changed-zone tests should assert type-contract-visible behavior indirectly by checking the existing route shapes remain correct:

- `apps/cloud-ui/src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`
  - `fromEpisode()` still preserves typed `editorPickSnapshot` state
  - search-derived routes still return the correct route shape without widening

If there are existing compile-time-only type assertions or route-shape tests near this area, update them to use the shared extracted type rather than local wrappers.

## 7. Forbidden Outcomes

- No generic `state?: unknown` on all podcast route objects
- No `PodcastRouteObject & { state?: ... }` blanket type exported as the new canonical contract if only a subset of routes needs it
- No local UI type continuing to duplicate the same route union after the shared extraction is introduced
- No widening to raw `{ to: string; params: Record<string, string> }`

## 8. Verification Plan

### Required Automated Verification

- `pnpm -C apps/cloud-ui exec tsc --noEmit`
- changed-zone vitest:
  - `apps/cloud-ui/src/components/EpisodeRow/__tests__/episodeRowModel.test.ts`

### Required Manual Verification

1. Confirm `EpisodeRow` navigation still supports editor-pick bootstrap state for episode/show content routes.
2. Confirm search-driven rows still route correctly and do not pick up arbitrary state.

## 9. Acceptance Criteria

- [ ] a shared explicit type exists for state-bearing content routes
- [ ] local UI wrappers for the same contract are removed or reduced to trivial aliases of the shared type
- [ ] route `to` / `params` typing remains precise
- [ ] `state` remains optional, typed, and narrow
- [ ] no runtime navigation behavior changes
- [ ] changed-zone typecheck and tests pass

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
