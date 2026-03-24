# Instruction: Streaming ZIP for Downloads Bundle Export

## Context
Current `DownloadsRepository.exportTrackBundle(...)` builds ZIP in memory. This is functionally correct but can cause high peak memory on large audio files (audio bytes + zip bytes + transient copies).

This instruction defines a production-safe migration path to a streaming ZIP export pipeline with browser-capability fallback.

## Must
1. Keep current user-facing behavior unchanged:
   - Downloads card `Download` action still exports one `.zip` containing audio + all subtitles.
   - Existing filename conventions remain unchanged unless explicitly noted below.
2. Do not regress subtitle format guarantees (extension must match content).
3. Use capability detection and fallback:
   - Prefer low-memory streaming path when supported.
   - Fall back to current in-memory path when unsupported.
4. Keep repository boundaries clean:
   - `DownloadsRepository` orchestrates domain logic.
   - ZIP writer implementation lives in isolated utility module(s).
5. Keep deterministic ordering inside ZIP:
   - audio first, subtitles in stable display order.

## Scope
- `apps/lite/src/lib/repositories/DownloadsRepository.ts`
- `apps/lite/src/lib/download.ts` (if needed for stream download API)
- New utility module(s) under `apps/lite/src/lib/zip/` (or existing equivalent lib folder)
- Related tests under:
  - `apps/lite/src/lib/repositories/__tests__/`
  - `apps/lite/src/lib/__tests__/` (if adding zip utility tests)

## Non-Goals
- No UI redesign.
- No change to menu placement or action naming.
- No backend/service changes.

## Required Changes

### A) Introduce streaming ZIP writer abstraction
Create a small abstraction with two implementations:
1. `buildZipStream(parts)` (preferred path)
2. `buildZipBlob(parts)` (fallback path, existing behavior)

Where `parts` is structured, e.g.:
- `{ path: string, blob: Blob }`
- or `{ path: string, stream: ReadableStream<Uint8Array>, size?: number, type?: string }`

Requirements:
- Stable input order => stable zip entry order.
- No `any` / unsafe casts.
- Utility module must be side-effect free and independently testable.

### B) Capability detection + policy
Add a feature gate function, e.g. `canUseStreamingZipExport()`:
- Detect required Web Streams + compression pipeline capabilities used by chosen implementation.
- Detect save strategy support if direct stream-save is used.

Policy:
- If streaming path fully supported: use streaming ZIP export.
- Else: use blob fallback (current implementation behavior).

### C) Integrate into `DownloadsRepository.exportTrackBundle`
Refactor `exportTrackBundle` to:
1. Build normalized bundle entries (audio + subtitles) once.
2. Route to streaming or fallback writer via capability gate.
3. Return the same success/failure contract expected by current callers.
4. Preserve current deterministic duplicate-name handling for subtitle files.

### D) Keep format/name contracts explicit
1. Audio filename contract unchanged.
2. Subtitle filename/content consistency unchanged (no extension/content mismatch).
3. ZIP root structure unchanged (no nested folder introduced unless currently present).

### E) Error handling
1. If streaming export fails mid-way, fall back to blob path once when safe.
2. If both fail, return explicit failure and keep existing caller error toast behavior.
3. No silent catch for critical path.

## Tests (Required)

### 1) Repository behavior parity
- Existing `exportTrackBundle` success test still passes with same output contract.
- Existing failure tests still pass.

### 2) Capability routing
Add focused tests to prove:
- streaming supported => streaming implementation is selected.
- streaming unsupported => blob fallback is selected.

### 3) Deterministic ordering
- Assert ZIP entry order remains stable: audio first, subtitles in expected order.

### 4) Duplicate subtitle filename handling
- Existing uniquify behavior still works in bundle export path.

### 5) Fallback-on-stream-failure
- Simulate streaming writer throw.
- Assert one-time fallback to blob path.
- Assert final result contract matches current semantics.

## Verification
Run and pass:
1. `pnpm -C apps/lite lint`
2. `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
3. `pnpm -C apps/lite test:run -- src/lib/repositories/__tests__/DownloadsRepository.test.ts`
4. `pnpm -C apps/lite test:run`

## Done Criteria
- Large bundle export no longer requires full in-memory ZIP on supported browsers.
- Unsupported browsers keep current behavior via fallback (no functional regression).
- Existing export contract and UI behavior remain unchanged.
- Tests cover routing, ordering, fallback, and naming invariants.

## Notes
- If browser support constraints block safe stream-save integration, keep streaming ZIP generation internal and convert to Blob as an interim step, but document memory tradeoff explicitly in handoff.
- Prefer incremental rollout behind internal feature flag if risk is high.
