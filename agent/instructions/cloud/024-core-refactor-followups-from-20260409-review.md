# Instruction 024: Core Refactor Follow-Ups From 2026-04-09 Review

## Objective
Convert the technically valid refactor opportunities identified in:

- `/Users/Leo_Qiu/Documents/dev/readio/agent/reviews/cloud/20260409-recent-commits-refactor-report.md`

into a disciplined follow-up implementation plan.

This instruction is not a "rewrite everything" task. It is a staged cleanup instruction for the highest-value structural issues that now have enough evidence to justify dedicated work.

## Source Review Summary
The review report is directionally correct on three points that are worth formal follow-up:

1. `/Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui/src/store/playerStore.ts`
   - the store has become too large and too multi-purpose
2. `/Users/Leo_Qiu/Documents/dev/readio/apps/cloud-api/discovery.go`
   - the graceful-degradation flow is correct but contains duplicated control flow
3. `/Users/Leo_Qiu/Documents/dev/readio/apps/cloud-api/.golangci.yml`
   - Go lint coverage is still intentionally conservative and can be strengthened

The report's broader architectural suggestions (for example a generalized "Playback Orchestrator" or central request manager rewrite) are explicitly out of scope for this instruction unless opened as later follow-up work.

## Execution Mode
This instruction should be executed as 3 smaller workstreams, not one large refactor.

Do:
- split the work by concern
- preserve existing user-facing behavior
- keep each workstream independently reviewable and testable
- prefer extraction and consolidation over architecture invention

Do not:
- redesign the playback architecture wholesale
- change product behavior while "cleaning up"
- bundle all workstreams into one giant PR
- use this instruction as cover for speculative abstractions

## Workstream A: `playerStore.ts` Responsibility Reduction

### Target
- `/Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui/src/store/playerStore.ts`

### Problem
`playerStore.ts` now mixes:
- playback state
- blob URL lifecycle
- session restoration
- local-download preference restore
- persistence side effects
- transcript/player-surface side effects
- request sequencing

That makes the module harder to reason about and raises regression risk for unrelated playback changes.

### Goal
Reduce the store's responsibility surface without changing current playback semantics.

### First-Pass Refactor Contract
The store should remain the owner of:
- canonical playback state
- simple primitive state setters
- request id / latest-load gating if it is still tightly coupled to state transitions

The store should stop directly owning large procedural flows that can be extracted into pure helpers or narrowly scoped services.

### Preferred Extraction Candidates
First-pass candidates:
1. session restore decision flow
2. local-download-preferred restore branch
3. blob URL preparation / cleanup helpers
4. persistence side-effect helpers

These may be extracted into helpers under a path such as:
- `/Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui/src/lib/player/`

The exact filenames may differ, but the extracted code must have clear ownership.

### Non-Goals
Do not in this task:
- replace Zustand
- invent a broad "PlaybackService" interface with speculative methods
- move every side effect out of the store just because it is possible
- rewrite transcript orchestration from scratch

### Acceptance Criteria
- [ ] `playerStore.ts` is materially smaller and less branch-dense
- [ ] session restore logic is easier to test in isolation
- [ ] blob URL lifecycle remains behaviorally identical
- [ ] no regressions in request sequencing / latest-load-wins behavior

### Tests
Must preserve and/or add focused tests for:
1. restore local-download preference
2. restore remote session fallback
3. blob URL revocation lifecycle
4. `loadRequestId` / request supersession behavior

### Review Focus
Reviewer must check:
1. no product behavior drift is hidden inside "cleanup"
2. extracted helpers have real ownership and are not just indirection wrappers
3. cross-store side effects did not become more implicit or less testable

---

## Workstream B: `discovery.go` Graceful-Degradation Consolidation

### Target
- `/Users/Leo_Qiu/Documents/dev/readio/apps/cloud-api/discovery.go`

### Problem
The current graceful-degradation behavior is functionally sound, but the `fresh/miss/stale` handling still contains duplicated control flow around:
- `singleflight`
- upstream fetch attempt
- stale fallback decision
- terminal cache-status mapping

That duplication raises maintenance cost for future cache behavior changes.

### Goal
Consolidate the miss/stale refresh path into one clearer control flow without changing the existing runtime contract.

### Refactor Contract
After the initial fresh-hit short circuit:
- there should be one unified refresh flow
- one place that runs the `singleflight` fetch
- one place that classifies upstream failure vs terminal error
- one place that maps to `fresh_hit` / `refreshed` / `stale_fallback` / `miss_error`

### Must Preserve
Do not change:
- cache TTL semantics
- stale fallback behavior
- singleflight per-key dedupe behavior
- observability canonical values

### Non-Goals
Do not in this task:
- redesign discovery cache storage
- add Redis
- change client-facing API responses
- broaden stale fallback to cover new error classes

### Acceptance Criteria
- [ ] `getWithGracefulDegradation()` is materially easier to read
- [ ] duplicated miss/stale refresh logic is reduced
- [ ] all existing cache-status behavior remains unchanged

### Tests
Must keep passing tests for:
1. fresh hit
2. stale fallback on upstream failure
3. refresh success
4. miss error
5. concurrent refresh singleflight behavior

If needed, add one focused test that locks cache-status outputs before/after refactor.

### Review Focus
Reviewer must check:
1. this is a readability refactor, not a hidden behavior change
2. `singleflight` ownership is still per cache key
3. stale fallback only applies to the same error classes as before

---

## Workstream C: Go Lint Hardening

### Target
- `/Users/Leo_Qiu/Documents/dev/readio/apps/cloud-api/.golangci.yml`
- `/Users/Leo_Qiu/Documents/dev/readio/.github/workflows/pr-ci.yml`

### Problem
The current Go lint setup is intentionally basic. That keeps noise low, but it also misses some valuable checks that are now worth enforcing in Cloud API code.

### Goal
Tighten Go static checks incrementally, not explosively.

### First-Pass Candidates
Evaluate enabling:
1. `bodyclose`
2. `contextcheck`
3. `gocritic`

These are candidates, not automatic must-enable linters. Each one must be validated against current code quality and false-positive rate.

### Rollout Contract
Lint hardening must be done safely:
1. enable one or more candidate linters
2. fix real violations
3. keep CI signal quality acceptable

If one candidate proves too noisy or mismatched for the current codebase, document that and do not force it into required CI in this task.

### Non-Goals
Do not:
- enable a huge kitchen-sink linter set
- add noisy rules just because they sound strict
- break local/CI parity

### Acceptance Criteria
- [ ] at least one meaningful new Go linter is evaluated and, if viable, enabled
- [ ] resulting violations are fixed rather than ignored blindly
- [ ] CI remains stable and understandable

### Tests / Verification
At minimum verify:
1. local `golangci-lint` invocation using the repository-supported version
2. `go test ./...`
3. PR CI Go job still passes

### Review Focus
Reviewer must check:
1. lint additions have real defect-prevention value
2. exclusions are justified, not cargo-culted
3. this task does not silently mutate unrelated Go code behavior

---

## Sequencing Recommendation
Do not execute all three workstreams in one pass.

Recommended order:
1. Workstream B: `discovery.go` consolidation
2. Workstream C: Go lint hardening
3. Workstream A: `playerStore.ts` responsibility reduction

Reason:
- B is the smallest and safest structural cleanup
- C is tooling hardening with bounded scope
- A is the highest-value but highest-regression-risk refactor

## Global Non-Goals
This instruction does not authorize:
- a player architecture rewrite
- a transcript orchestration rewrite
- a cross-app state-management migration
- generalized infra abstraction for its own sake

## Completion Criteria
This instruction should only be marked complete when:
- at least one workstream has been executed and reviewed successfully
- remaining workstreams are either completed separately or explicitly deferred with rationale

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-04-09
- **Reviewed by**:
