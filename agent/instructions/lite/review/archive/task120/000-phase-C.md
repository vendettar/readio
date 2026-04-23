# Task 120 - Phase C Review Template (Stores & Async State Machines)


## Report Output Path (Mandatory)
- `agent/reviews/lite/120-phase-C-report.md`
- rerun format: `agent/reviews/lite/120-phase-C-report-rN.md`
## Phase Target
- Phase: C (Stores & Async State Machines)
- Scope:
  - `apps/lite/src/store/exploreStore.ts`
  - `apps/lite/src/store/playerStore.ts`
  - `apps/lite/src/store/historyStore.ts`
  - `apps/lite/src/store/filesStore.ts`
  - `apps/lite/src/store/playerSurfaceStore.ts`
  - `apps/lite/src/store/transcriptStore.ts`
  - `apps/lite/src/store/searchStore.ts`
  - `apps/lite/src/store/sleepTimerStore.ts`
  - `apps/lite/src/store/themeStore.ts`
- Out of scope:
  - presentational component styling
  - generated route artifacts

## Mandatory Preconditions
- Read and follow:
  - `apps/docs/content/docs/general/design-system/index.mdx`
  - `apps/docs/content/docs/general/charter.mdx`
  - `apps/docs/content/docs/general/audit-system.mdx`
  - `apps/docs/content/docs/general/improvement-process.mdx`
  - `apps/docs/content/docs/general/technical-roadmap.mdx`
- Use review-first mode (no direct implementation in this phase report).

## Review Checklist (Phase C)
1. State machine integrity
- transitions are deterministic and recoverable.
- no stuck intermediate states.

2. Async race and cancellation
- request-id / last-write-wins policy correctness.
- no stale async commits after route/store switch.

3. Selector and subscription hygiene
- atomic selectors in components/hooks.
- avoid broad subscriptions causing unnecessary re-renders.

4. Persistence contract
- write-path normalization and key consistency.
- no silent fallback on critical persisted fields.

5. User-facing safety
- destructive actions require explicit confirmation.
- errors shown as natural language, no technical leakage.

6. Performance hotspots
- repeated loops/derivations inside hot actions/selectors.
- expensive sync work in interactive paths.

7. Cross-cutting quality gates (mandatory)
- Workaround/hack audit with replacement direction.
- Redundancy/dead-code audit with cleanup direction.
- Best-practice compliance check against project standards.
- Hot-path complexity note (`O(...)`) with scale assumptions.
- Better-implementation note (or explicit deferral rationale).

## Findings Format (Use Exactly)
- Finding ID format: `<Phase>-<YYYYMMDD>-<NNN>` (example: `C-20260213-001`).
- Risk score: `Impact (1-5) x Likelihood (1-5) = Score (1-25)`.
### [BLOCKING] <Title>
- File: `<path>:<line>`
- Failure mode:
- Why this is blocking:
- Required fix direction:
- Owner instruction: `117 | 118 | 119 | 12x-...`
- Verification:
- Risk Score: `Impact x Likelihood = Score`

## Severity Criteria (Mandatory)
- `BLOCKING`: correctness/safety/contract/CI-blocking issue.
- `IMPORTANT`: high-risk drift or near-term bug risk.
- `IMPROVEMENT`: non-critical optimization/refactor.

## Evidence Requirements (Mandatory per Finding)
- Repro steps:
- Expected vs Actual:
- Hard evidence (test/command/code path):

## Dedup Rule
- Same root cause across multiple files must be merged into one primary finding with related references.

## Closure Rule
- Close only when: code fix + verification pass + doc/instruction sync (if contract changed).

## Regression Observation Window (High Risk Only)
- For routing/caching/async/state-machine fixes, add observation note for next 2 related commits.

### [IMPORTANT] <Title>
- File: `<path>:<line>`
- Failure mode:
- Required fix direction:
- Owner instruction:
- Verification:
- Risk Score: `Impact x Likelihood = Score`

### [IMPROVEMENT] <Title>
- File: `<path>:<line>`
- Context:
- Suggested optimization:
- Owner instruction:
- Verification:
- Risk Score: `Impact x Likelihood = Score`

## Assignment Table (Mandatory)
| Finding ID | Severity | Owner Instruction | Verification Command | Status |
|---|---|---|---|---|
| C-001 | BLOCKING | 118 | `pnpm -C apps/lite test:run` | Open |

## File Coverage Inventory (Mandatory)
| File | Classification (major/minor) | Status (Reviewed / Not Applicable / Deferred) | Notes |
|---|---|---|---|
| apps/lite/src/store/exploreStore.ts | major | Deferred | |

- Rule:
  - all `major` files in phase scope must be `Reviewed`,
  - for `minor` files, any invoked/critical method must be inspected and logged.

## Definition of Done (Phase, Mandatory)
- major file coverage inventory attached and `major reviewed = 100%`.
- each finding has unique ID + owner instruction + risk score.
- no unassigned finding remains.
- required verification commands are executed/recorded.
- explicit verdict with rationale is present.

## Phase Verdict
- Decision: `APPROVE` or `REJECT`
- Rationale:
- Open questions/assumptions:

## Completion Lifecycle (Mandatory)
- Completed by:
- Reviewed by:
- Date:
- Commands executed (exact):
- Result summary:

## Decision Log / Bilingual Sync
- Decision Log update required: `Yes | No`
- Bilingual sync required: `Yes | No`
- Target files (if required):

## Backfill Protocol
- Append to existing instructions when matched:
  - `117`: route/country/error-classification/cache-contract/country-switch stale
  - `118`: async cancellation/request-id/race/isolation
  - `119`: legacy resolver/decommission/negative cleanup guardrails
- Create `12x-*.md` under `agent/instructions/lite/patch/` for unmatched findings.

## Verification Command Baseline
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:db-guard`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite i18n:check`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`

## Optional Command Extensions (When Relevant)
- Build gate (required when config/routing/dependency/build scripts change, or at phase boundary sign-off):
  - `pnpm -C apps/lite build`

## Completion Criteria (Phase C)
- Store/state-machine findings are fully mapped to owner instructions.
- No unassigned async-state risk remains.
- Cross-cutting quality gate answers are complete and explicit.
- File coverage inventory is present and `major reviewed = 100%`.
