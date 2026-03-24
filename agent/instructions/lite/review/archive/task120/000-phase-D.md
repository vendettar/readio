# Task 120 - Phase D Review Template (Routes & User Flows)


## Report Output Path (Mandatory)
- `agent/reviews/lite/120-phase-D-report.md`
- rerun format: `agent/reviews/lite/120-phase-D-report-rN.md`
## Phase Target
- Phase: D (Routes & User-Flow Correctness)
- Scope:
  - `apps/lite/src/routes/**` (excluding generated `routeTree.gen.ts`)
  - `apps/lite/src/routeComponents/**`
  - `apps/lite/src/components/{AppShell,GlobalSearch,EpisodeRow,PodcastCard,Explore,Files,Player,Settings,Selection,Transcript}/**`
- Out of scope:
  - deep algorithmic internals already covered in Phase A/B/C.

## Mandatory Preconditions
- Read and follow:
  - `apps/docs/content/docs/general/design-system/index.mdx`
  - `apps/docs/content/docs/general/charter.mdx`
  - `apps/docs/content/docs/general/audit-system.mdx`
  - `apps/docs/content/docs/general/improvement-process.mdx`
  - `apps/docs/content/docs/general/technical-roadmap.mdx`
- Use review-first mode (report first, no implementation in this phase output).

## Review Checklist (Phase D)
1. Route correctness and navigation continuity
- back/forward behavior and deep-link correctness.
- route param validation and canonicalization.

2. Playback continuity
- route changes and UI mode changes do not interrupt active playback.
- audio controller mounting and state continuity are preserved.

3. Interaction semantics and a11y
- no `div + onClick` for primary interactions.
- keyboard reachability and focus behavior for overlays/menus.

4. i18n and copy compliance
- no new hardcoded user-facing strings.
- new keys exist across supported locales.

5. Files and Explore behavior rules
- single-level Files model and folder/file behavior consistency.
- Explore content behavior aligns with product constraints.

6. Design-system compliance
- token use, component primitive use, no forbidden global CSS patterns.

7. Cross-cutting quality gates (mandatory)
- Workaround/hack audit with replacement direction.
- Redundancy/dead-code audit with cleanup direction.
- Best-practice compliance check against project standards.
- Hot-path complexity note (`O(...)`) with scale assumptions.
- Better-implementation note (or explicit deferral rationale).

## Findings Format (Use Exactly)
- Finding ID format: `<Phase>-<YYYYMMDD>-<NNN>` (example: `D-20260213-001`).
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
| D-001 | IMPORTANT | 12x-ui-flow-fix.md | `pnpm -C apps/lite test:run` | Open |

## File Coverage Inventory (Mandatory)
| File | Classification (major/minor) | Status (Reviewed / Not Applicable / Deferred) | Notes |
|---|---|---|---|
| apps/lite/src/routeComponents/ExplorePage.tsx | major | Deferred | |

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

## Completion Criteria (Phase D)
- All route/user-flow findings are assigned and verifiable.
- No unresolved playback continuity or navigation regression remains.
- Cross-cutting quality gate answers are complete and explicit.
- File coverage inventory is present and `major reviewed = 100%`.
