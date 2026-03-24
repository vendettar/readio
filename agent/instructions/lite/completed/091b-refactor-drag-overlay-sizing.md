# Task: 091b - Simplify DragOverlay Preview Sizing [COMPLETED]

## Objective
Simplify DragOverlay preview sizing on Files pages by removing page-local DOM measurement + ResizeObserver coupling, while keeping drag UX stable.

This instruction only covers overlay sizing behavior.
Coordinate modifier consolidation is handled by **091**.

## Product Decision (Fixed)
1. Replace dynamic measured width (`ResizeObserver` + CSS var) with deterministic density-based width tokens.
2. Use one shared preview width strategy across Files root and folder pages.
3. Keep drag preview readability and truncation behavior consistent with current design.
4. Keep `snapCenterCursor` usage intact (from 091 shared module).
5. Remove overlay sizing state and DOM measure refs from route components.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No DB/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No logging changes.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - DragOverlay sizing becomes deterministic by density, not by measured folder card width.
- Tests:
  - Add component tests for density-specific overlay width classes.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Remove ResizeObserver lifecycle to avoid stale observer callbacks.
- Hot-path performance:
  - Eliminate measurement observers in drag path to reduce layout/reflow pressure.
- State transition integrity:
  - Drag start/end/cancel must not retain stale preview width state.
- Dynamic context consistency:
  - Density changes must immediately reflect preview width in both Files pages.

## Implementation Steps (Execute in Order)
1. **Create shared overlay width utility**
   - Add:
     - `apps/lite/src/lib/dnd/previewSizing.ts`
   - Export deterministic mapping:
     - `getDragPreviewWidthClass(density: ViewDensity): string`
   - Fixed mapping (required):
     - `comfortable -> w-72`
     - `compact -> w-64`

2. **Refactor FilesIndexPage overlay sizing**
   - Update:
     - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
   - Remove:
     - `folderCardWidthPx` state
     - `folderMeasureEl` state/ref
     - `ResizeObserver` effect
     - `dragPreviewWidthPx` state
     - inline `--drag-preview-w` style usage
   - Apply shared width class from `getDragPreviewWidthClass(density)` to DragOverlay preview container.

3. **Align FilesFolderPage overlay sizing**
   - Update:
     - `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`
   - Replace hardcoded width class with shared width utility result.
   - Keep existing typography/icon density behavior unchanged.

4. **Keep preview component structure stable**
   - Do not redesign preview content layout.
   - Keep icon/text hierarchy and truncation behavior intact.

5. **Add tests**
   - Add:
     - `apps/lite/src/lib/dnd/__tests__/previewSizing.test.ts`
   - Cover deterministic mapping for both density modes.
   - Add route-level render tests or targeted snapshot assertions for overlay container width class usage in both pages.

6. **Docs sync (atomic)**
   - Update Files handoff docs to reflect deterministic density-based overlay sizing and removal of runtime DOM width measurement.

## Acceptance Criteria
- No ResizeObserver-based overlay width measurement remains in Files pages.
- Files root and folder pages use the same sizing policy utility.
- Overlay width switches deterministically with density mode:
  - comfortable `w-72`
  - compact `w-64`
- Drag UX remains stable on desktop and touch devices.

## Required Tests
1. `apps/lite/src/lib/dnd/__tests__/previewSizing.test.ts`
   - deterministic width class mapping.
2. Route-level checks:
   - Files root page overlay uses utility class.
   - Files folder page overlay uses utility class.
3. Manual drag regression:
   - root page drag preview readability.
   - folder page drag preview readability.
   - compact/comfortable switching affects preview width as expected.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/dnd/__tests__/previewSizing.test.ts`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/dnd/previewSizing.ts` (new)
  - `apps/lite/src/routeComponents/files/FilesIndexPage.tsx`
  - `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`
  - `apps/lite/src/lib/dnd/__tests__/previewSizing.test.ts` (new)
  - docs under `apps/docs/content/docs/apps/lite/handoff/features/files-management*`
- Regression risks:
  - visual width mismatch against previous measured style
  - text wrapping/truncation differences at boundary widths
- Required verification:
  - deterministic class mapping tests pass
  - manual drag preview readability passes in both densities

## Forbidden Dependencies
- Do not add UI libraries.
- Do not reintroduce DOM measurement for overlay width.
- Do not modify drag drop target semantics.

## Required Patterns
- Shared utility for width policy.
- No magic numbers in route components.
- Keep route components focused on composition.

## Decision Log
- Required: No.

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/lib/dnd/__tests__/previewSizing.test.ts`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-11
