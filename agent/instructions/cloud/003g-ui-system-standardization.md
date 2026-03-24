# Instruction 003g: Shared UI Primitive Standardization

## Parent
- `agent/instructions/cloud/003-cloud-architecture.md`
- This instruction is a follow-up to `003d-first-shared-ui-extraction.md`

## Status
- **Objective**: standardize the frontend primitive system across `apps/lite` and `apps/cloud-ui`
- **Primary goal**: make `apps/cloud-ui` use the same Tailwind + shadcn-compatible primitive layer as `apps/lite`
- **Hard boundary**: `apps/cloud-ui` must never depend on `apps/lite`

## Product / Architecture Decision
`apps/lite` and `apps/cloud-ui` are separate web apps.

They should share:
- design language
- primitive component APIs
- design tokens
- presentation-only UI building blocks

They must not share:
- app-owned routing
- app-owned networking
- app-owned state
- app-owned page composition
- direct source imports between app directories

This means:
- `apps/cloud-ui` must not import from `apps/lite`
- `packages/ui` must not import from `apps/lite`
- shared UI must live in `packages/ui`
- `apps/lite` and `apps/cloud-ui` may both consume `@readio/ui`

## Repository Reality
Current state:
- `apps/lite` already uses Tailwind CSS v4 and shadcn-style primitives
- `apps/cloud-ui` is still in a transitional CSS state
- `packages/ui` exists, but its current CSS/class contract is not yet the settled shared primitive system

This instruction is not about forcing the two apps into identical page structure.
It is about aligning the primitive layer so both apps use the same control system.

## Non-Goals
This instruction must not:
- make `apps/cloud-ui` import components from `apps/lite`
- re-export `apps/lite` files from `packages/ui`
- attempt full-site "100% visual parity"
- rewrite all Cloud UI pages
- rewrite all Lite pages
- ban all raw `<button>` or `<input>` usage in every special-case interaction
- mix in routing, networking, or CD changes

## Target Contract

### 1. Shared Primitive Ownership
The shared primitive layer must live in `packages/ui`.

Allowed pattern:
- use `apps/lite` components as the implementation reference
- migrate the needed logic into `packages/ui`
- update both apps to consume `@readio/ui`

Disallowed pattern:
- `packages/ui` importing from `apps/lite`
- `apps/cloud-ui` importing from `apps/lite`
- path aliasing `apps/lite` into `apps/cloud-ui`
- "temporary" re-export bridges from Lite app code

### 2. Shared Primitive Scope
This instruction only standardizes the first primitive slice:
- `cn`
- `Button`
- `Input`
- the minimal style/token loading contract required to make those primitives work in both apps

It does not standardize:
- all layout components
- all page shells
- all cards
- all overlays
- all route-specific controls

### 3. Styling Contract
The shared primitive system must be Tailwind + shadcn-compatible.

Required characteristics:
- `Button` preserves `variant`, `size`, and `asChild` compatibility
- `Input` preserves the standard Lite interaction contract
- `cn` is shared and stable
- shared primitive styling must be available to both `apps/lite` and `apps/cloud-ui`

Important constraint:
- shared primitive styling must not rely on Cloud-only CSS being loaded by Lite
- shared primitive styling must not rely on Lite-only CSS being loaded by Cloud UI

If a shared stylesheet is required, the loading contract must be explicit and must be used by both apps.

### 4. App-Specific Composition Boundary
Shared primitives must stay presentation-only.

App-specific composition remains app-owned:
- page layout
- route composition
- Cloud-specific shells
- Lite-specific surfaces
- app-specific settings affordances

Cloud-specific product differences remain valid:
- Cloud UI should not expose the Lite-only CORS proxy mental model
- Lite may keep browser-owned affordances that Cloud does not need

## Required Work

### Phase 1: Shared Primitive Foundation
In `packages/ui`:
1. establish the shared `cn` utility using the same behavioral contract as Lite
2. add the minimum dependencies needed for shadcn-compatible primitives:
   - `clsx`
   - `tailwind-merge`
   - `class-variance-authority`
   - `@radix-ui/react-slot`
3. define a stable export surface for:
   - `cn`
   - `Button`
   - `Input`

### Phase 2: Primitive Migration into `packages/ui`
Use Lite's current primitive implementations as the source reference.

Required rules:
- migrate the logic into `packages/ui`
- do not re-export files directly from `apps/lite`
- do not keep `packages/ui` coupled to Lite app internals
- preserve the public primitive API expected by Lite where practical

### Phase 3: Shared Styling / Token Load Contract
Define the minimum styling contract required so both apps can render the shared primitives correctly.

Required rules:
- write down where the shared primitive styles live
- ensure both apps load them intentionally
- do not make shared primitives depend on app-local class definitions
- keep app-level page styling separate from primitive styling

This phase must explicitly separate:
- shared primitive styles/tokens
- app-owned page/shell styles

### Phase 4: Cloud UI Adoption
Update `apps/cloud-ui` to consume the shared primitive layer.

Required rules:
- use `@readio/ui` primitives instead of the current ad hoc CSS atom pattern where the migrated primitives apply
- remove transitional primitive duplication from Cloud UI only where replaced
- do not import from `apps/lite`
- do not copy Lite app structure into Cloud UI

### Phase 5: Lite Adoption / Convergence
Update Lite to consume the same shared primitives where this instruction's changed zone applies.

Required rules:
- keep Lite behavior stable
- do not regress visual/interaction contracts
- do not force unrelated Lite UI rewrites

## Best Practice Rules

### Rule 003g-1
Prefer shared `Button` and `Input` for standard app controls.

Exception:
- native elements are still allowed where specialized semantics or interaction behavior require them

### Rule 003g-2
Shared primitive changes belong in `packages/ui`.

App-specific visual composition belongs in the app:
- `apps/lite`
- `apps/cloud-ui`

Do not push Cloud-only page styling into the shared primitive base just to make a single screen look right.

### Rule 003g-3
If a primitive is shared, its styling contract must be shared too.

Do not repeat the earlier mistake where a shared component depended on CSS loaded by only one app.

### Rule 003g-4
The goal is shared primitive consistency, not full-site structural sameness.

Do not use this instruction to enforce identical page composition between Lite and Cloud UI.

## Required Tests
Add or update the minimum tests needed to prove the shared primitive contract is real.

At minimum cover:
1. `packages/ui` `Button` preserves expected `variant`, `size`, and `asChild` behavior
2. `packages/ui` `Input` preserves expected base interaction contract
3. Lite can render the shared primitives without relying on Cloud-only CSS
4. Cloud UI can render the shared primitives without relying on Lite-only CSS
5. no active import path in `apps/cloud-ui` points into `apps/lite`
6. no active import path in `packages/ui` points into `apps/lite`

## Verification
1. `pnpm --filter @readio/ui build`
2. `pnpm --filter @readio/cloud-ui build`
3. `pnpm --filter @readio/cloud-ui test`
4. `pnpm -C apps/lite typecheck`
5. `pnpm -C apps/lite lint`
6. targeted tests for the migrated primitive components
7. targeted search to confirm no active import path from `apps/cloud-ui` or `packages/ui` reaches into `apps/lite`

## Done When
- `apps/cloud-ui` uses the shared Tailwind + shadcn-compatible primitive layer
- `apps/lite` and `apps/cloud-ui` both consume `@readio/ui` primitives for the changed zone
- `packages/ui` does not depend on `apps/lite`
- `apps/cloud-ui` does not depend on `apps/lite`
- shared primitive styling works in both apps through an explicit loading contract
- verification commands are green

## Do Not Fold In
- full layout standardization
- full page-shell unification
- route restructuring
- networking changes
- Cloud CD changes
- broad visual redesign
- mass replacement of every native control in the repository
