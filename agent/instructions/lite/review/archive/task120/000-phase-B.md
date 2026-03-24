# Task 120 - Phase B Review Template (Server State & Data Flow)


## Report Output Path (Mandatory)
- `agent/reviews/lite/120-phase-B-report.md`
- rerun format: `agent/reviews/lite/120-phase-B-report-rN.md`
## Phase Target
- Phase: B (Server State & Data Flow)
- Scope:
  - `apps/lite/src/lib/discovery/**`
  - `apps/lite/src/lib/routes/podcastRoutes.ts`
  - `apps/lite/src/hooks/useDiscoveryPodcasts.ts`
  - `apps/lite/src/hooks/useEpisodeResolution.ts`
  - `apps/lite/src/lib/requestManager.ts`
  - `apps/lite/src/routeComponents/podcast/**` (data-fetch behavior only)
- Out of scope:
  - UI-only visual styling changes
  - generated file style review (`apps/lite/src/routeTree.gen.ts`)

## Mandatory Preconditions
- Read and follow:
  - `apps/docs/content/docs/general/design-system/index.mdx`
  - `apps/docs/content/docs/general/charter.mdx`
  - `apps/docs/content/docs/general/audit-system.mdx`
  - `apps/docs/content/docs/general/improvement-process.mdx`
  - `apps/docs/content/docs/general/technical-roadmap.mdx`
- Use review-first mode:
  - no implementation in this report,
  - findings must include file + line + failure mode.

## Review Checklist (Phase B)
1. Query key and cache contract
- feed key normalization consistency.
- country-scoped vs non-country-scoped key separation.

2. Resolver and route-country SSOT
- no `location.state.country` dependency in `/$country/podcast/*` paths.
- no hidden fallback that breaks deterministic route behavior.

3. Async cancellation and stale protection
- in-flight cancellation on param switch.
- stale response cannot overwrite new route-country context.

4. Error classification
- region-unavailable vs generic failure misclassification checks.
- explicit recovery CTA path exists.

5. Link builder consistency
- all podcast/episode route generation uses centralized builders.
- no inline route string assembly in active callers.

6. Performance and duplicate work
- avoid duplicated fetches and avoidable recomputation.
- request deduping correctness under fast navigation.

7. Cross-cutting quality gates (mandatory)
- Workaround/hack audit with replacement direction.
- Redundancy/dead-code audit with cleanup direction.
- Best-practice compliance check against project standards.
- Hot-path complexity note (`O(...)`) with scale assumptions.
- Better-implementation note (or explicit deferral rationale).

## Findings Format (Use Exactly)
- Finding ID format: `<Phase>-<YYYYMMDD>-<NNN>` (example: `B-20260213-001`).
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
| B-001 | BLOCKING | 117 | `pnpm -C apps/lite test:run` | Open |

## File Coverage Inventory (Mandatory)
| File | Classification (major/minor) | Status (Reviewed / Not Applicable / Deferred) | Notes |
|---|---|---|---|
| apps/lite/src/lib/discovery/index.ts | major | Deferred | |

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

## Completion Criteria (Phase B)
- Findings are fully assigned to `117/118/119/12x`.
- No unassigned finding remains.
- Route-country/cancellation/cache findings have explicit verification steps.
- Cross-cutting quality gate answers are complete and explicit.
- File coverage inventory is present and `major reviewed = 100%`.
