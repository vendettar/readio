# Instruction 130: Progressive ASR Chunk Ramp for Fast First Subtitle [COMPLETED]

## Hard Dependencies
- Instruction 123 (online ASR API integration) must be merged.
- Instruction 125 (background ASR transcription + chunk merge) must be merged.
- Instruction 127a (transport policy) must be merged.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `apps/lite/src/lib/asr/index.ts`
- `apps/lite/src/lib/asr/mp3Chunker.ts`
- `apps/lite/src/lib/remoteTranscript.ts`

## Goal
When playback starts and ASR is running, reduce the “silent subtitle wait window” by making early chunks very small, then quickly ramp chunk size and converge to large chunks.

Target user-visible behavior:
- chunk 1 ≈ 5s
- chunk 2 ≈ 10s
- then progressive growth
- later chunks can be 600s (10 minutes) with existing max-byte guard

At the same time:
- avoid excessive API call count growth versus current fixed-large-slice strategy
- keep merge semantics stable while hardening MP3 frame-boundary detection/splitting

## Product Decisions (Locked)
1. Use **duration-driven progressive plan** when `expectedDurationSeconds` is available and valid.
2. Keep existing byte hard cap (`ASR_MAX_BLOB_BYTES`) as non-negotiable safety limit.
3. Progressive ramp is **front-loaded** only; once ramp phase ends, switch to large steady chunks (up to 600s).
4. Add **call budget guard** so total chunk count does not grow unbounded on long episodes.
5. If duration estimate is missing/unreliable, fallback to existing byte-only split behavior (no risky guessing).
6. No DB schema changes and no migration/backfill work (first-release policy).
7. Add **short-audio bypass**: if `expectedDurationSeconds <= 90`, skip ramp and use single chunk.
8. Add **absolute call cap** (`ABSOLUTE_MAX_CALLS = 24`) in addition to budget guard.

## Scope
- `apps/lite/src/lib/asr/index.ts`
- `apps/lite/src/lib/asr/mp3Chunker.ts` (if helper extension is needed)
- `apps/lite/src/lib/asr/types.ts` (only if plan metadata typing is added)
- `apps/lite/src/lib/asr/__tests__/mp3Chunker.test.ts`
- `apps/lite/src/lib/asr/__tests__/index*.test.ts` (new/updated)
- `apps/lite/src/lib/remoteTranscript.ts` (only if progress metadata propagation is needed)
- docs:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Algorithm (Implementation Contract)

### 1) Progressive Duration Sequence
- Base ramp seconds:
  - `RAMP_SEQUENCE_SECONDS = [5, 10, 20, 60]`
- Steady phase:
  - all following chunks use `600s` target (subject to byte cap and remaining duration)

This keeps first subtitle arrival fast, but reaches large chunks sooner than pure doubling ramps, reducing extra API calls.

### 2) Call Budget Guard (Critical)
Define:
- `baselineCalls = ceil(expectedDurationSeconds / 600)`
- `maxExtraCalls = min(4, max(2, ceil(baselineCalls * 0.5)))`
- `hardCallBudget = baselineCalls + maxExtraCalls`
- `ABSOLUTE_MAX_CALLS = 24`

Rule:
- If `baselineCalls >= ABSOLUTE_MAX_CALLS`, skip progressive plan and fallback to existing behavior.
- While generating chunk plan, if projected chunk count would exceed `hardCallBudget`,
  stop ramping and fill remaining audio with 600s steady chunks.
- When progressive plan is active, final chunk count must satisfy:
  - `chunkCount <= hardCallBudget`
  - `chunkCount <= ABSOLUTE_MAX_CALLS`

This guarantees “faster first subtitle” without large call explosion.

### 3) Duration -> Byte Conversion
Given:
- `bytesPerSecond = blob.size / expectedDurationSeconds`
- `targetChunkBytes = floor(targetChunkSeconds * bytesPerSecond)`

Effective per-chunk byte cap:
- `effectiveChunkBytes = clamp(targetChunkBytes, 1, ASR_MAX_BLOB_BYTES)`

Then split using strict frame-boundary logic with that per-chunk target.

Important:
- VBR header sanitization behavior remains unchanged.
- MP3 frame-boundary validation/search is hardened via strict header checks and two-frame confirmation.
- Existing retry and merge logic remains unchanged.

### 4) Fallback Rules
- If `expectedDurationSeconds <= 0` or missing:
  - keep current behavior (existing `maxChunkSize` policy).
- If computed `bytesPerSecond` is invalid:
  - fallback to existing behavior.
- If plan generation yields empty plan:
  - fallback to existing behavior.
- If `baselineCalls >= ABSOLUTE_MAX_CALLS`:
  - fallback to existing behavior (avoid risky over-optimized plan on extreme duration metadata).
- If source format is outside current frame-safe split guarantees:
  - keep current behavior; do not force progressive plan.
- If first progressive split result exceeds `hardCallBudget`:
  - run one deterministic convergence retry with scaled chunk targets.
  - only fallback to legacy if retry still exceeds budget (`split_result_exceeds_budget`).

### 5) Plan Invariants (Required)
- `sum(planSeconds)` must equal total duration within tolerance (`<= 1s` rounding drift).
- Every planned chunk duration must be strictly positive.
- Ramp-phase entries must be monotonic non-decreasing.
- When progressive plan is active, generated chunk count must respect both guards:
  - `<= hardCallBudget`
  - `<= ABSOLUTE_MAX_CALLS`

## Pseudocode (Normative)
```ts
function buildChunkDurationPlan(totalSec: number): number[] {
  if (totalSec <= 90) return [totalSec]

  const ramp = [5, 10, 20, 60]
  const baselineCalls = Math.ceil(totalSec / 600)
  const absoluteMaxCalls = 24
  if (baselineCalls > absoluteMaxCalls) return [] // caller must fallback to existing behavior
  const maxExtraCalls = Math.min(4, Math.max(2, Math.ceil(baselineCalls * 0.5)))
  const hardBudget = baselineCalls + maxExtraCalls
  const callBudget = hardBudget

  const plan: number[] = []
  let remaining = totalSec

  for (const sec of ramp) {
    if (remaining <= 0) break
    // If adding this ramp chunk risks exceeding hard budget, break to steady phase
    const projected = plan.length + 1 + Math.ceil(Math.max(0, remaining - sec) / 600)
    if (projected > callBudget) break
    const d = Math.min(sec, remaining)
    plan.push(d)
    remaining -= d
  }

  while (remaining > 0) {
    plan.push(Math.min(600, remaining))
    remaining -= 600
  }
  return plan
}
```

## Performance and UX Targets
1. First partial subtitle should be emitted significantly earlier than fixed 600s slicing on long audio.
   - KPI definition: measure from `ASR task start timestamp` to `first cue emitted`, not from play-click timestamp.
2. For long episodes, total chunk calls should stay within:
   - `baselineCalls + 2 ~ +4` (bounded by budget rule), not unbounded linear inflation.
3. No regression in final merged timeline correctness.

## Hidden Risk Sweep
- Timestamp drift risk:
  - Must continue using actual returned duration/cue-based duration merge logic as current implementation does.
- Retry amplification:
  - More small early chunks may increase retry opportunities; budget guard limits this.
- Provider throttling risk:
  - Keep existing retry policy and backoff; do not add aggressive parallelism in this instruction.
- Memory pressure:
  - Do not hold duplicate full-buffer copies beyond current behavior.

## Required Patterns
- Single plan builder helper in ASR layer (SSOT).
- Keep split execution sequential (same as now), preserve progress callback behavior.
- Keep current merge function (`mergeAsrCues`) as authoritative timeline combiner.
- No page-level heuristics; chunk policy belongs only in ASR transport layer.

## Forbidden Dependencies
- No new npm dependencies.
- No provider-specific chunk policy forks in UI/runtime callers.
- No parallel chunk fan-out in this instruction.

## Execution Path

### Phase 1: Plan Builder
1. Add `buildChunkDurationPlan(totalSec)` in ASR layer with ramp + budget guard.
2. Add unit tests for:
   - short audio (single chunk)
   - medium audio (ramp partially used)
   - long audio (ramp then 600s steady)
   - budget guard + absolute call cap enforcement

### Phase 2: Integrate Into Transcribe Flow
1. In `transcribeAudioWithRetry`, when duration is valid:
   - build duration plan
   - convert each planned duration to bytes
   - split progressively with frame-boundary-safe path
2. Preserve current fallback path when duration is unavailable.
3. Preserve current fallback path for unsupported/non-frame-safe source format.

### Phase 3: Validation and Observability
1. Keep existing progress callback semantics.
2. Add structured logs for plan summary:
   - planned durations
   - planned chunk count
   - baseline/budget values
   - first chunk duration + first chunk bytes
   - fallback reason when progressive plan is skipped

## Acceptance Criteria
1. First chunk target duration is 5s, second is 10s, then progressive increase.
2. Later chunks can reach 600s while respecting `ASR_MAX_BLOB_BYTES`.
3. Total chunk count is budget-bounded (`<= baseline + maxExtraCalls` by plan contract).
4. If `baselineCalls >= ABSOLUTE_MAX_CALLS`, progressive plan is skipped and existing behavior is used.
5. When progressive plan is active, total chunk count is also absolute-bounded (`<= ABSOLUTE_MAX_CALLS`).
6. `expectedDurationSeconds <= 90` uses single chunk path.
7. Missing duration metadata falls back to previous behavior without errors.
8. Existing merge correctness and playback subtitle alignment are preserved.
9. No DB schema changes, no migration code introduced.

## Tests (Required)
- Unit:
  - plan builder sequence correctness for representative durations.
  - budget guard clamps chunk count growth.
  - when `baselineCalls >= ABSOLUTE_MAX_CALLS`, plan builder returns fallback signal.
  - short-audio bypass (`<= 90s`) returns single-chunk plan.
  - invariants:
    - positive durations
    - monotonic ramp phase
    - sum(plan) within tolerance
- Integration:
  - long audio scenario emits early progress callback faster in terms of planned first chunk size.
  - final merged cue timeline remains monotonic and correctly offset.
  - fallback path parity when `expectedDurationSeconds` absent.
  - fallback path parity for unsupported/non-frame-safe source format.
- Regression:
  - existing ASR retry behavior unchanged for non-chunk-policy logic.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/mp3Chunker.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/index*.test.ts`
- `pnpm -C apps/lite test:run`

## Decision Log
- Required: Yes.
- Append one entry to `apps/docs/content/docs/general/decision-log.mdx`:
  - why front-loaded progressive chunking is adopted
  - why bounded extra-call budget is required
  - why fallback keeps old behavior when duration signal is unavailable

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/mp3Chunker.test.ts`
  - `pnpm -C apps/lite test:run -- "src/lib/asr/__tests__/index*.test.ts"`
  - `pnpm -C apps/lite test:run`
- Date: 2026-03-04
