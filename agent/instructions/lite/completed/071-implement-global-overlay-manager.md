> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx` before starting.

# Task: Implement Overlay Layering & Portal Standardization

## Objective
Prevent Z-Index conflicts and overlay leaks by standardizing layering and Portal usage **without** introducing a global modal state system.

## 1. Define Overlay Layer Tokens
- **Path**: `apps/lite/src/lib/overlayLayers.ts`.
- **Implementation**: Export a small map of z-index tokens (e.g., `overlay`, `toast`, `tooltip`, `menu`).
- **Rule**: Do NOT create a global modal/overlay store. Keep `isOpen` state local to the component per design-system rules.

## 2. Standardize Portal Usage
- **Requirement**: Every overlay component (Rename, Delete, Import) MUST use Radix UI's `<Portal>` to render at the end of the `<body>`.
- **Rule**: Do NOT open Dialog/AlertDialog from inside a DropdownMenu; keep multi-step confirmations within the same menu surface.

## 3. Refactor Components
- **Action**: Audit overlay components for consistent z-index usage and Portal behavior.
- **Move**: Replace any inline `z-[9999]` hacks with the shared layer tokens.

## 4. Verification
- **Test**: Open a Modal, then trigger a Toast.
- **Check**: Toast must appear ABOVE the Modal (`z-index` check). Verify the background is properly `aria-hidden`.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/ui-patterns/shell.mdx` (Overlay stratification).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Patch Additions (Integrated)
# Patch: 071-implement-global-overlay-manager

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
- Define z-index token list + portal rule enforcement.
