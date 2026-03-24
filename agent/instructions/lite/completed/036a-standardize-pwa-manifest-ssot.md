> **⚠️ CRITICAL**: This task is about eliminating PWA manifest drift. Do NOT change app UI/UX.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/environment.mdx` before starting.

# Task: Standardize PWA Manifest SSOT (VitePWA) and Filename

## Objective
Enforce a single source of truth (SSOT) for the PWA manifest to prevent silent drift and deploy-time mismatches.

**Decision**: SSOT = `VitePWA({ manifest })` in `apps/lite/vite.config.ts`.

## Current State (Verified)
- Build output currently emits `dist/manifest.webmanifest`, and `dist/index.html` references it via `<link rel="manifest" href="/manifest.webmanifest">`.
- `apps/lite/index.html` does **not** contain a `<link rel="manifest">` (injection happens at build time).
- `apps/lite/public/` does **not** contain `manifest.json` (no dual-source today).

## Scope Scan (8 Scopes)
- **Config**: YES (`apps/lite/vite.config.ts` PWA settings)
- **Persistence**: No
- **Routing**: YES (ensure rewrites do not break manifest path)
- **Logging**: No
- **Network**: YES (manifest/icon fetch paths)
- **Storage**: No
- **UI State**: No
- **Tests**: YES (build verification + artifact inspection)

## Hidden Risk Sweep
- **Deploy rewrite conflicts**: Catch-all rewrites must not shadow `/manifest.*` or icon paths.
- **CSP/Headers**: Ensure CSP permits manifest and icon fetch (`'self'` should suffice).

---

## Requirements
1. **Single Source of Truth**:
   - **Allowed**: Define manifest via `VitePWA({ manifest: { ... } })`.
   - **Forbidden**: Do not introduce or maintain `apps/lite/public/manifest.json` (or any second manifest file) as an editable source.
2. **Stable Output Filename**:
   - Output MUST be `manifest.json` (per product preference) and referenced consistently by the built HTML.
3. **Index Link Consistency**:
   - `dist/index.html` MUST reference the same manifest filename emitted in `dist/`.
   - `apps/lite/index.html` MAY omit the manifest link if VitePWA injects it; if a static link is added, it MUST match the emitted filename.

---

## Implementation Steps (Coder)

### 1) Standardize manifest filename
**File**: `apps/lite/vite.config.ts`
- Set `manifestFilename: 'manifest.json'` in the `VitePWA({ ... })` config.
- Keep `manifest: { ... }` defined in Vite config (SSOT).

### 2) Ensure there is no public manifest source
**File/Dir**: `apps/lite/public/`
- Confirm `manifest.json` does not exist.
- If any manifest file exists, remove it to avoid drift.

### 3) Verify build artifacts
Run:
- `pnpm --filter @readio/lite build`

Then verify:
- `apps/lite/dist/manifest.json` exists.
- `apps/lite/dist/index.html` contains `<link rel="manifest" href="/manifest.json">`.

### 4) Deploy rewrite safety check (required)
Verify the deployment routing does not shadow static assets:
- If using Vercel rewrites (`vercel.json`) or Nginx `try_files`, ensure `/manifest.json` and icons are served as static files (not rewritten to `/index.html`).
- If the platform applies rewrites before static, add explicit exclusions for `/manifest.json` and `/readio*.png` paths.

---

## Documentation Updates (Required)
- Update `apps/docs/content/docs/apps/lite/handoff/environment.mdx` and `.zh.mdx`:
  - State SSOT = `VitePWA.manifest`.
  - State output filename = `manifest.json`.
  - Explicitly forbid `apps/lite/public/manifest.json`.

## Verification
- `pnpm --filter @readio/lite build`

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-01-29
- **Reviewed by**:

## Patch Additions (Integrated)
# Patch: 036a-standardize-pwa-manifest-ssot

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
- Add manifest drift audit check.
