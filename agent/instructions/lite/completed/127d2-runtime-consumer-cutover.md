# Instruction 127d2: Runtime Consumer Cutover [COMPLETED]

## Status
- [ ] Active
- [x] Completed

## Hard Dependencies
- `agent/instructions/lite/127d1-schema-and-repository-cutover.md` must be completed and reviewed.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `agent/instructions/lite/127d-schema-unification-feasibility.md`

## Goal
Cut over runtime consumers from dual-track lookup to unified `tracks` resolution.

## Scope
- `apps/lite/src/lib/downloadService.ts`
- `apps/lite/src/lib/remoteTranscript.ts`
- `apps/lite/src/lib/integrity.ts`
- `apps/lite/src/lib/retention.ts`
- `apps/lite/src/lib/vault.ts`
- `apps/lite/src/store/**`
- `apps/lite/src/lib/**/__tests__/*`
- `apps/lite/src/store/**/__tests__/*`

## Scope Scan (8 Scopes)
- Config:
  - No new config key; consume existing runtime settings only.
- Persistence:
  - Medium-high impact: runtime read/write paths migrate to unified track identity.
- Routing:
  - No route changes; route-triggered playback behavior must stay equivalent.
- Logging:
  - Keep existing runtime error classification and context fields stable.
- Network:
  - No direct API contract changes.
- Storage:
  - Medium-high impact: runtime consumers must target unified `tracks` linkage.
- UI state:
  - High impact: playback/transcript store transitions can regress if identity mapping is wrong.
- Tests:
  - High impact: runtime integration tests must be updated for unified track resolution.

## Product Decisions (Locked)
1. Runtime path must resolve `localTrackId` against unified `tracks` only.
2. No dual fallback (`getFileTrack` then `getPodcastDownload`) remains in runtime code.
3. Subtitle/session/integrity semantics remain behavior-compatible.

## Hidden Risk Sweep
- Async:
  - restore/playback races must not reintroduce stale track-id branches.
- Hot path:
  - avoid per-row extra DB calls in playback/transcript hot loops.

## State Transition Integrity
1. Playback recoverability must remain intact.
2. Subtitle active/fallback behavior must stay deterministic.

## Dynamic Context Consistency
1. Runtime consumers must not freeze ASR provider/model snapshot in module-level singletons.
2. Track resolution paths must remain deterministic across language/country/theme context changes.

## Acceptance Criteria
1. Runtime consumers no longer import/use dual-track lookup API.
2. Existing playback/session/transcript tests pass or are updated without behavior regression.
3. Integrity and retention logic operate on unified track references.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscript.integration.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/retention.test.ts`
- `pnpm -C apps/lite test:run -- src/store/__tests__/playerStore.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/downloads/__tests__/subtitleSelection.test.ts`
- `bash -lc "if rg -n 'getFileTrack\\(|getPodcastDownload\\(' apps/lite/src/lib apps/lite/src/store --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy dual-track lookup API usage found in runtime layer' && exit 1; fi"`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/downloadService.ts`
  - `apps/lite/src/lib/remoteTranscript.ts`
  - `apps/lite/src/lib/integrity.ts`
  - `apps/lite/src/lib/retention.ts`
  - `apps/lite/src/lib/vault.ts`
  - `apps/lite/src/store/**`
- Regression risks:
  - Playback restore resolving wrong track identity.
  - Transcript apply path failing to attach cues after cutover.
  - Downloads subtitle playback priority (override/active/fallback) drift.
- Required verification:
  - All commands above pass before activating `127d3`.

## Decision Log
- Required: Waived (implementation slice only; parent `127d`/`127d3` own final architectural log entry).

## Bilingual Sync
- Not applicable for this slice.

## Completion
- Completed by: Gemini CLI
- Commands: Evaluated remotePlayback, remoteTranscript, tests. Ran tsc and tests to verify.
- Date: 2026-02-27
- Reviewed by: Codex
