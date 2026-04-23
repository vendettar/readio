# Full Code Review - 6 Rounds (Pass 2)

- Date: 2026-02-28
- Scope: `apps/lite/src` + `packages/core/src`
- File inventory: 498 code files
- Method: full-scope pattern scans + targeted deep-read on high-risk modules

## Round 1 - SSOT + Boundary/Import Governance (001 + 006)

### Coverage
- Full-file scans for:
  - direct `db` imports and raw persistence touchpoints
  - discriminator literal usage
  - patch/temporary markers
  - logging path consistency
- Deep-read focus:
  - `lib/repositories/*`
  - `lib/player/*`
  - `lib/downloadService.ts`
  - `lib/remoteTranscript.ts`

### Findings

#### P2 - Repository boundary remains partially bypassed by service-layer raw `db` reads/writes
- Evidence:
  - `apps/lite/src/lib/downloadService.ts:16`
  - `apps/lite/src/lib/remoteTranscript.ts:12`
  - `apps/lite/src/lib/files/ingest.ts:6`
  - `apps/lite/src/lib/retention.ts:2`
- Impact:
  - Cross-module data policies (normalization, guardrails, auditability) remain distributed instead of converging through repository interfaces.
  - Future schema contract changes require wider edits and increase drift risk.
- Fix Direction:
  - Define explicit repository ownership per domain (downloads/files/transcript/retention) and gradually migrate raw `db` callers to canonical APIs.

#### P3 - Logging path is mostly unified but storage helper still bypasses logger
- Evidence:
  - `apps/lite/src/lib/storage.ts:19`
- Impact:
  - Inconsistent observability style and log routing; storage failures in dev go through `console.warn` instead of unified logger semantics.
- Fix Direction:
  - Route via logger wrapper (dev-gated if needed) to keep one log pipeline.

## Round 2 - Async Race + State Transition Integrity (002 + 003)

### Coverage
- Global async/state pattern scan over hooks/stores/routes/player/transcript pipelines.
- Deep-read focus:
  - `hooks/useSession.ts`
  - `lib/player/remotePlayback.ts`
  - `hooks/useAppInitialization.ts`
  - `store/playerStore.ts`

### Findings

#### P2 - App readiness can be forced while session restoration is still unresolved
- Evidence:
  - `apps/lite/src/hooks/useAppInitialization.ts:84`
  - `apps/lite/src/hooks/useAppInitialization.ts:93`
- Impact:
  - After 3 seconds, `isReady` becomes true even if player restoration is still blocked/failed, creating a potential inconsistent window between UI readiness and playback state readiness.
- Fix Direction:
  - Keep timeout fallback, but expose an explicit degraded flag/reason and log timeout path so UI and diagnostics can distinguish normal ready vs forced ready.

#### P3 - Dead async-control API suggests incomplete/abandoned cancellation refactor
- Evidence:
  - `apps/lite/src/lib/player/remotePlayback.ts:57`
  - only declaration found, no callsites in scope
- Impact:
  - Unused exported control surface (`createPlaybackAbortController`) increases cognitive overhead and may mislead future changes.
- Fix Direction:
  - Remove unused export or wire it through actual call paths; avoid keeping dormant control APIs.

## Round 3 - Storage/Retention + Unified Track Invariants (005 + 010)

### Coverage
- Full scan of schema/index/cascade and track-source discriminated paths.
- Deep-read focus:
  - `lib/dexieDb.ts`
  - `lib/downloadService.ts`
  - `lib/retention.ts`
  - `lib/vault.ts`

### Findings

#### P2 - Root-folder listing path still uses full sourceType scan + in-memory filter
- Evidence:
  - `apps/lite/src/lib/dexieDb.ts:695`
  - `apps/lite/src/lib/dexieDb.ts:700`
- Impact:
  - For large user-upload libraries, root folder listing performs full materialization and filter, increasing latency and memory churn.
- Fix Direction:
  - Mirror the count-path strategy: attempt indexed compound query for `[sourceType+folderId+createdAt]` with `null` first, fallback only on environments with null-key quirks.

#### P2 - Orphan-blob sweep does full-table materialization across 3 tables
- Evidence:
  - `apps/lite/src/lib/downloadService.ts:580`
  - `apps/lite/src/lib/downloadService.ts:581`
  - `apps/lite/src/lib/downloadService.ts:582`
- Impact:
  - Maintenance task scales poorly with library size and can cause noticeable main-thread pressure.
- Fix Direction:
  - Add incremental sweep strategy or indexed chunked traversal; avoid loading all blobs/tracks/sessions in one pass.

## Round 4 - Hot-path Performance + Solution Selection/Reuse (004 + 011)

### Coverage
- Pattern scan for repeated heavy work and non-indexed scans.
- Solution-selection audit for custom control abstractions and reuse opportunities.

### Findings

#### P3 - `clearAllDownloads` performs strictly sequential deletion, no batching strategy
- Evidence:
  - `apps/lite/src/lib/downloadService.ts:565`
  - `apps/lite/src/lib/downloadService.ts:566`
- Impact:
  - Large libraries may experience long operation windows.
- Fix Direction:
  - Keep safety semantics, but consider bounded batching with progress checkpoints to reduce long-tail latency.

#### P3 - Verification TODO debt in production constants remains unresolved
- Evidence:
  - `apps/lite/src/constants/app.ts:63`
  - `apps/lite/src/constants/app.ts:72`
  - `apps/lite/src/constants/app.ts:81`
  - `apps/lite/src/constants/app.ts:90`
  - `apps/lite/src/constants/app.ts:99`
  - `apps/lite/src/constants/app.ts:108`
- Impact:
  - Country-specific curated defaults are partially placeholder, reducing consistency of first-run experience.
- Fix Direction:
  - Track as explicit instruction backlog with acceptance criteria, not open-ended TODO comments.

## Round 5 - Non-Functional + Operability (012)

### Coverage
- Observability/resilience/security/a11y/i18n pattern checks.
- Security-sensitive rendering and sanitization review points.

### Findings

#### P2 - Forced-ready path lacks explicit operational signal for degraded startup
- Evidence:
  - `apps/lite/src/hooks/useAppInitialization.ts:84`
  - `apps/lite/src/hooks/useAppInitialization.ts:92`
- Impact:
  - Runtime diagnostics cannot reliably distinguish healthy init vs timeout-forced init.
- Fix Direction:
  - Emit structured event/log and expose degraded-init state to diagnostics UI.

#### P3 - Storage parse-failure path is fully silent (`getJson` catch -> null)
- Evidence:
  - `apps/lite/src/lib/storage.ts:52`
- Impact:
  - Corrupted storage values can repeatedly self-heal to `null` without audit trail, complicating root-cause analysis.
- Fix Direction:
  - Keep fail-safe behavior, but add lightweight dev telemetry (or one-shot diagnostics marker) on parse failures.

## Round 6 - Test Gap + Regression Anchors (009)

### Coverage
- Test inventory and gap checks against changed high-risk behaviors.
- Regression anchor check against critical suites.

### Findings

#### P2 - Missing regression test: `useSession` when `upsertPlaybackSession` rejects after ID generation
- Evidence:
  - behavior path: `apps/lite/src/hooks/useSession.ts:143` to `apps/lite/src/hooks/useSession.ts:166`
  - current test file lacks reject-path assertion for this branch: `apps/lite/src/hooks/__tests__/useSession.test.ts`
- Impact:
  - Recent ordering hardening can regress silently if future changes reintroduce early store writes or partial commit states.
- Fix Direction:
  - Add deterministic test where `DB.upsertPlaybackSession` rejects; assert `sessionId` remains unchanged and no stale committed state is left.

#### P3 - Missing targeted test for root-folder indexed path vs fallback path behavior split
- Evidence:
  - branch under review: `apps/lite/src/lib/dexieDb.ts:723` to `apps/lite/src/lib/dexieDb.ts:740`
- Impact:
  - Future refactors may break one branch while preserving the other, especially across browser vs fake-indexeddb differences.
- Fix Direction:
  - Add tests that cover both the indexed branch and forced fallback branch with explicit assertions.

## Commands Executed (Evidence)
- inventory:
  - `rg --files apps/lite/src packages/core/src`
- boundary/ssot scans:
  - `rg -n "import { ... db ... } from .*dexieDb" ...`
  - `rg -n "sourceType === '...'" ...`
  - `rg -n "console.(log|error|warn|info|debug)" ...`
- async/state scans:
  - `rg -n "useEffect|AbortController|setTimeout|setInterval" ...`
  - `rg -n "epoch|stale|requestId|inflight|cleanup|finally" ...`
- storage/perf scans:
  - `rg -n "toArray\(|bulkDelete|removeDownloadedTrack|local_subtitles|audioBlobs" ...`
- security/test-gap scans:
  - `rg -n "dangerouslySetInnerHTML|DOMPurify|sanitize" ...`
  - `rg -n "as any" ...`

## Summary
- Total findings: 12
- Severity mix:
  - `P2`: 7
  - `P3`: 5
- No `P0/P1` correctness blocker found in this pass.

## Closure Update (2026-03-01)

- Overall status: `12/12 Closed`
- Verification baseline:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
  - targeted regression suites for startup/session/storage/download/dexie branches

### Finding Status

- Round 1 / P2 repository boundary bypass -> `Closed`
- Round 1 / P3 storage helper bypasses logger -> `Closed`
- Round 2 / P2 forced-ready unresolved window -> `Closed`
- Round 2 / P3 dead async-control API -> `Closed`
- Round 3 / P2 root-folder listing full scan path -> `Closed`
- Round 3 / P2 orphan sweep full materialization -> `Closed`
- Round 4 / P3 clearAllDownloads strict sequential path -> `Closed`
- Round 4 / P3 constants TODO debt -> `Closed`
- Round 5 / P2 forced-ready missing degraded signal -> `Closed`
- Round 5 / P3 storage parse-failure fully silent -> `Closed`
- Round 6 / P2 missing `useSession` reject-path regression test -> `Closed`
- Round 6 / P3 missing root-folder branch split test -> `Closed`
