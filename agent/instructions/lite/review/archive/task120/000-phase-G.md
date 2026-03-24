# Task 120 - Phase G Review Template (Docs App, Monorepo, Root CI/Workspace)


## Report Output Path (Mandatory)
- `agent/reviews/lite/120-phase-G-report.md`
- rerun format: `agent/reviews/lite/120-phase-G-report-rN.md`
## Phase Target
- Phase: G (Docs App + Monorepo Boundary)
- Scope:
  - `apps/docs/**` (implementation + config + content-consistency boundary)
  - repo root CI/workspace configs (e.g. `.github/workflows/**`, `pnpm-workspace.yaml`, turbo config if present)
  - cross-app contract points between `apps/lite` and `packages/core`
- Out of scope:
  - deep Lite feature behavior already covered in A-F.

## Mandatory Preconditions
- Read and follow:
  - `apps/docs/content/docs/general/design-system/index.mdx`
  - `apps/docs/content/docs/general/charter.mdx`
  - `apps/docs/content/docs/general/audit-system.mdx`
  - `apps/docs/content/docs/general/improvement-process.mdx`
  - `apps/docs/content/docs/general/technical-roadmap.mdx`
- Review-first mode: findings/backfill first, no implementation changes in this phase report.

## Review Checklist (Phase G)
1. Docs app architecture consistency
- docs implementation does not conflict with Lite runtime contracts.
- internal docs references match current instruction system and code reality.

2. Monorepo boundary health
- workspace package boundaries are clear and dependency directions are valid.
- no accidental cyclic dependency through docs/tooling paths.

3. Root CI alignment
- required checks for Lite are present and blocking where intended.
- no mismatch between documented process and CI reality.

4. Cross-language/doc sync checks
- EN/ZH decision/contract docs stay semantically aligned.
- no stale or contradictory policy statements.

5. Guardrail portability
- instruction and script rules are discoverable from docs/review flow.
- no orphan review protocol files.

6. Cross-cutting quality gates (mandatory)
- Workaround/hack audit with replacement direction.
- Redundancy/dead-code audit with cleanup direction.
- Best-practice compliance check against project standards.
- Hot-path complexity note (`O(...)`) with scale assumptions where applicable.
- Better-implementation note (or explicit deferral rationale).

## Findings Format (Use Exactly)
- Finding ID format: `<Phase>-<YYYYMMDD>-<NNN>` (example: `G-20260213-001`).
- Risk score: `Impact (1-5) x Likelihood (1-5) = Score (1-25)`.
### [BLOCKING] <Title>
- File: `<path>:<line>`
- Failure mode:
- Why this is blocking:
- Required fix direction:
- Owner instruction: `117 | 118 | 119 | 12x-...`
- Verification:
- Risk Score: `Impact x Likelihood = Score`

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

## Assignment Table (Mandatory)
| Finding ID | Severity | Owner Instruction | Verification Command | Status |
|---|---|---|---|---|
| G-001 | IMPORTANT | 12x-monorepo-docs-ci-alignment.md | `pnpm -C apps/lite test:run` | Open |

## File Coverage Inventory (Mandatory)
| File | Classification (major/minor) | Status (Reviewed / Not Applicable / Deferred) | Notes |
|---|---|---|---|
| apps/docs/content/docs/general/charter.mdx | major | Deferred | |
| apps/docs/content/docs/general/technical-roadmap.mdx | major | Deferred | |
| apps/docs/content/docs/apps/lite/coding-standards/index.mdx | major | Deferred | |

- Rule:
  - `apps/docs/**` coverage must include a complete file appendix in the phase report (major/minor split is allowed); the three rows above are examples only and are not sufficient as full coverage evidence.
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

## Completion Criteria (Phase G)
- Docs/monorepo/root-CI findings are fully assigned and verifiable.
- No unassigned cross-app or CI/doc-drift risk remains.
- File coverage inventory is present and `major reviewed = 100%`.
