# Instruction 018: Cloud Session Restore — Prefer Local Download Over Remote URL [COMPLETED]

> **⚠️ CRITICAL**: Focused bugfix only. Do not redesign download flow, ASR, proxy, or generic playback architecture.

## Problem

When Cloud UI restores a playback session, it may restore from `lastSession.audioUrl` (remote URL) even when the same episode has already been downloaded locally. This causes:
- Unnecessary remote mp3 requests
- Possible CORS/proxy fallback noise
- Violates user expectation that downloaded content restores locally

## Goal

When restoring a playback session, prefer an already-downloaded local audio blob over the remote audio URL whenever the same episode has been downloaded.

## Scope

- `apps/cloud-ui` only
- Focused restore/session/playback-source logic only
- Tests for the restore path
- No backend changes
- No `/api/proxy` changes
- No download-flow redesign
- No ASR changes
- No generic playback architecture rewrite

## Required Contract

1. If the restored session already has `audioId` and the blob exists:
   - Keep current local restore behavior (no change)

2. If the restored session only has `audioUrl`:
   - Attempt to resolve that URL through the existing local-download lookup path before restoring remote playback
   - If a downloaded track with a readable local blob exists, restore from local blob instead of remote URL
   - When this local-preference path succeeds, bind `localTrackId` to the matched downloaded track id
   - The restored player state must behave as a downloaded local track for downstream logic that depends on local-track identity
   - If no downloaded track exists, or the blob is missing/unreadable, fall back to the existing remote restore path

3. Preserve:
   - Session id
   - Progress restore
   - Active track identity, including establishing `localTrackId` when restore resolves to a downloaded track
   - Existing transcript/session metadata behavior

4. Do not eagerly download anything during restore.

5. Do not mutate unrelated playback logic.

## Preferred Implementation Direction

- Reuse existing local resolution logic where possible
- Avoid duplicating download lookup rules
- Keep the change localized to restore/session playback source resolution

## Required Approach

1. Start with a failing reproducer test.
2. Reproduce this exact case:
   - A playback session exists with remote `audioUrl`
   - Later, the same episode is downloaded and exists in Downloads
   - App/session restore runs
   - Current behavior restores remote URL instead of local blob
3. Fix restore logic so it prefers local downloaded audio when available.
4. Ensure the local-preference restore path does not leave player state in a remote/local hybrid state.

## Tests Must Cover

1. Remote session + later-downloaded matching episode → restore uses local blob and binds `localTrackId` to the matched download track id
2. Remote session with no matching download → restore stays remote
3. Remote session with matching download record but missing blob → restore falls back to remote
4. Existing local-session restore path still works unchanged
5. Progress/session identity still restore correctly after local preference

## Verification

- Run focused Cloud UI tests for the changed restore/playback source area
- Include the new reproducer test
- `pnpm -C apps/cloud-ui test:run`
- `pnpm -C apps/cloud-ui lint`
- `pnpm -C apps/cloud-ui typecheck`

## Review Focus

Reviewer must check:
1. The reproducer test fails before the fix and passes after
2. No regression to existing local-session restore path
3. No regression to remote-only restore path
4. Session identity and progress are preserved
5. No eager download triggered during restore
6. Download lookup logic is reused, not duplicated
7. Restore-from-download does not leave local-track-dependent behavior in remote mode because `localTrackId` was omitted

## Non-goals

- No backend changes
- No `/api/proxy` changes
- No download-flow redesign
- No ASR changes
- No generic playback architecture rewrite
- No UI changes

## Documentation

- Not applicable (focused bugfix, no docs update needed)

## Completion
- **Completed by**: Readio Worker
- **Commands**: 
  - `pnpm -C apps/cloud-ui test:run -- playerStore.restore-local-download` (5/5 PASS)
  - `pnpm -C apps/cloud-ui test:run -- playerStore.test` (20/20 PASS, no regression)
  - `pnpm -C apps/cloud-ui lint` (PASS)
  - `pnpm -C apps/cloud-ui typecheck` (PASS)
- **Date**: 2026-04-05
- **Reviewed by**: Readio Reviewer (QA)
