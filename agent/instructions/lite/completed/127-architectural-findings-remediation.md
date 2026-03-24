# Instruction 127: Architectural Findings Remediation (From Review 000)

## Hard Dependencies
- `agent/instructions/lite/review/000-architectural_review.md` (template and review protocol baseline)

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/general/technical-roadmap.mdx`

## Source
- This instruction is self-contained as the concrete review instance.
- `agent/instructions/lite/review/000-architectural_review.md` is governance template only.
- Activation rule:
  - `Findings to Remediate` + `New Findings` sections in this file are the single source of execution input.

## Goal
Convert the current architectural findings into an executable remediation sequence with atomic child instructions.  
This instruction is the parent coordinator. Do not implement all items directly in one pass.

## Product Decisions (Locked)
1. First-release policy stays active: no legacy data migration burden by default.
2. Request coalescing authority is centralized in `apps/lite/src/lib/requestManager.ts`.
3. ASR retry semantics must be extracted and standardized; avoid feature-local retry divergence.
4. Player transport state and transcript/ASR orchestration state must be clearly bounded.
5. `127d` (track schema unification) is explicitly approved for implementation in this phase.
6. `127e` (metadata normalization) remains deferred unless explicitly approved.

## Constraint Check
- Constitution alignment: Required.
- Roadmap sequence alignment: Required before activating any child instruction.
- Single active instruction rule: only one child (`127a`..`127f`) may be active at a time.
- First-release compatibility policy: no migration burden unless explicitly approved.

## Scope
- Parent planning/remediation scope:
  - `apps/lite/src/lib/asr/*`
  - `apps/lite/src/lib/fetchUtils.ts`
  - `apps/lite/src/lib/requestManager.ts`
  - `apps/lite/src/lib/remoteTranscript.ts`
  - `apps/lite/src/lib/downloadService.ts`
  - `apps/lite/src/store/playerStore.ts`
  - `apps/docs/content/docs/apps/lite/handoff/features/*.mdx`
  - `apps/docs/content/docs/general/decision-log.mdx`

## Scope Scan (8 Scopes)
- Config:
  - Risk: runtime settings defaults and schema parity.
- Persistence:
  - Watch: no migration allowed in this instruction family.
- Routing:
  - Watch: remediation must not regress search/history/detail route semantics.
- Logging:
  - Risk: retry and failure logs can become noisy without standardization.
- Network:
  - Risk: layered retries and partial dedup create amplification risk.
- Storage:
  - Watch: no storage contract expansion in this parent instruction.
- UI state:
  - Risk: store-boundary cleanup can regress player/transcript coordination.
- Tests:
  - Risk: root typecheck is insufficient; app tsconfig gate is mandatory.

## Hidden Risk Sweep
- Async control flow:
  - Retry loops across pipeline layers can multiply real upstream requests.
  - Feature-local in-flight maps can drift from a single cancellation contract.
- Hot-path performance:
  - Transcript parsing and active-subtitle resolution must stay off render hot path.
  - Store coupling can increase render fan-out under playback updates.

## State Transition Integrity (Required)
- Blocking-mode risk check:
  - Refactors must not introduce states where playback/transcript actions become permanently blocked.
- Recovery path check:
  - Every transient failure state (retry exhausted, cancellation, parse failure) must have a deterministic recovery action.

## Dynamic Context Consistency (Required)
- Context keys checked:
  - language, country/region, ASR provider/model, runtime config snapshot.
- Consistency rule:
  - No module may freeze these contexts in stale singleton/memo states when runtime values change.

## Findings to Remediate

### P1 (Now)
1. Retry policy is embedded in ASR domain pipeline instead of a transport-policy layer.
2. Request coalescing exists but adoption is inconsistent across features.

### P2 (Next)
3. `playerStore` mixes transport state with transcript/ASR orchestration state.
4. ASR settings default/normalization logic is duplicated across modules and can drift.
5. `local_tracks` and `podcast_downloads` schema should be unified to remove polymorphic track resolution.

### Deferred (Later, approval required)
1. Metadata normalization across sessions/favorites/downloads.

## New Findings (Code Review Delta: 2026-02-27)

### [Medium] ASR settings snapshot logic duplicated (drift risk)
- Evidence:
  - `apps/lite/src/hooks/useSettingsForm.ts:47`
  - `apps/lite/src/lib/remoteTranscript.ts:108`
- Impact:
  - ASR runtime gating and settings UI hydration may diverge when default/fallback policy changes in one place only.
  - Can reintroduce inconsistent behavior across playback blocking, ASR execution, and settings display.
- Fix Direction:
  - Extract one shared normalizer (single authority) for `{ asrProvider, asrModel }`.
  - Replace duplicated normalization in both modules.
  - Add contract tests covering empty storage, partial storage, and runtime config fallback.

### [Low] Deprecated hook drift risk in `useAsrEnabled`
- Evidence:
  - `apps/lite/src/hooks/useAsrEnabled.ts`
- Impact:
  - Redundant hook can drift from runtime gating rules and create conflicting behavior.
- Fix Direction:
  - Remove the hook and gate directly on provider/model/key readiness in runtime paths.

## Execution Plan (Atomic Child Instructions Required)

### Activation Sequence (Locked)
1. `127a` (retry authority extraction)
2. `127b` (request coalescing convergence)
3. `127f` (ASR settings snapshot SSOT)
4. `127c` (player/transcript store boundary)
5. `127d` (track schema unification implementation)
6. `127e` remains deferred design-only

### Child Progression Gate (Mandatory)
- Only one child instruction may be active at any time.
- Next child may start only when previous child has:
  - verification commands passed,
  - instruction H1 tagged `[COMPLETED]`,
  - `Completion.Reviewed by` populated.

### 127a (Now): Retry Policy Extraction
- Extract retry/backoff classification into a reusable transport utility.
- Keep ASR pipeline focused on chunk orchestration and result mapping.
- Add tests for 5xx, 429, retry-after, and fail-fast boundaries.

### 127b (Now): Request Coalescing Convergence
- Converge feature-local in-flight dedup to `requestManager`.
- Standardize cancellation/cleanup semantics.
- Preserve existing user-visible behavior.

### 127c (Next): Store Boundary Refactor
- Separate transcript/ASR orchestration state from transport playback state.
- Keep external behavior unchanged and selector contracts explicit.
- Add regression tests for playback + transcript sync.

### 127d (Now): Track Schema Unification Implementation
- Unify `local_tracks` and `podcast_downloads` into a single authoritative `tracks` store with `sourceType` discriminator.
- Remove polymorphic foreign-key checks against two track tables in runtime paths.
- Keep first-release policy: no legacy migration burden; perform clean schema transition.

### 127e (Deferred Analysis): Metadata Normalization Feasibility
- Design-only evaluation with read/write impact and migration policy note.
- No implementation unless user explicitly approves.

### 127f (Now): ASR Settings Snapshot SSOT
- Create a shared normalizer for ASR settings snapshot/default policy.
- Refactor `useSettingsForm` and `remoteTranscript` to consume the same helper.
- Remove deprecated `useAsrEnabled` and gate directly on provider/model/key readiness.
- Add targeted tests for normalization and fallback consistency.

## Impact Checklist
- Affected modules:
  - Network transport policy
  - In-flight request dedup
  - Player/transcript state boundaries
- Regression risks:
  - Retry behavior changes can alter perceived availability.
  - Coalescing changes can suppress legitimate requests if keyed incorrectly.
  - Store split can cause subtitle/playback state drift if contracts are unclear.
- Required verification:
  - Lint, selector lint, app typecheck, targeted tests, full test run.

## Verification Commands (For each child instruction)
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- Child-specific targeted tests must be added in each child instruction.
- `pnpm -C apps/lite build` (required at phase boundary)

## Current Review Baseline (2026-02-27)
- Executed:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscript.integration.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/remoteTranscript.asr.test.ts`
- Result:
  - All commands passed in current workspace state.

## Forbidden Dependencies
- No new global state library.
- No backend dependency introduction.
- No migration script or compatibility branch unless separately approved.

## Decision Log
- Required: Yes.
- Add entry to:
  - `apps/docs/content/docs/general/decision-log.mdx`
- Must include:
  - why retry policy authority moved
  - why coalescing authority unified
  - risk notes and rollback boundary

## Bilingual Sync
- Required: Not applicable for this parent instruction.
- Child instructions must declare bilingual sync requirement per touched docs.

## Acceptance Criteria (Parent)
1. Every active finding in this instruction is mapped to one atomic child instruction.
2. Each child instruction contains explicit verification commands and risk notes.
3. No child instruction introduces migration burden without explicit approval.
4. Decision log entries are added when architectural authority is changed.
5. Child instruction activation strictly follows `Activation Sequence (Locked)`.
6. No roadmap completion checkbox is updated before child `Reviewed by` is present.

## Lifecycle & Roadmap Sync
- Official completion requires both:
  - child instruction H1 includes `[COMPLETED]`
  - `Completion` section includes `Reviewed by`
- `technical-roadmap.mdx` / `.zh.mdx` sync is Worker-owned and allowed only after review sign-off.

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
