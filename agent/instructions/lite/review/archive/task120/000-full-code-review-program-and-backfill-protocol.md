# Task: 120 (Patch) - Full-Scope Deep Code Review Program + Backfill Protocol [COMPLETED]

## Goal
Define an executable, full-scope, deep code-review program for a large codebase, with strict reviewer-role alignment, phased risk control, and deterministic backfill into existing instructions (`117/118/119`) or new follow-up instructions.

## Why This Exists
One-pass “review everything deeply” is not credible for current codebase size. This task defines a staged review workflow that is:
- comprehensive,
- evidence-based,
- auditable,
- and compatible with ongoing development.

## Scope
- Primary: `apps/lite/src/**`
- Secondary (boundary validation): `packages/core/src/**`
- Supporting: `apps/lite/scripts/**`, route guards, test suites, and architecture-critical docs for spec-drift checks.
- Extended (phase F/G):
  - `apps/lite/{vite.config.ts,tailwind.config.js,tsconfig*.json,vitest.config.ts,playwright.config.ts,index.html,public/**}`
  - repo/root-level CI and workspace config (when present)
  - `apps/docs/**` (docs app implementation + config/docs drift boundary)

## Preconditions (Must Read First)
- Read and align with current repository constraints before each phase:
  - `apps/docs/content/docs/general/design-system/index.mdx`
  - `apps/docs/content/docs/general/charter.mdx`
  - `apps/docs/content/docs/general/audit-system.mdx`
  - `apps/docs/content/docs/general/improvement-process.mdx`
  - `apps/docs/content/docs/general/technical-roadmap.mdx`
- Treat `apps/lite/src/routeTree.gen.ts` as generated output:
  - do not raise stylistic findings for generated sections,
  - only report issues if generation or references are broken.
- Review-first rule:
  - do not mix implementation changes into the same pass,
  - produce findings and backfill instructions first, then implement in follow-up tasks.

## Review Standards (Reviewer-Role Aligned)
- Instruction matching and completeness.
- Architectural boundaries and SSOT contracts.
- Negative-path correctness (no misclassification).
- Async control flow and cancellation integrity.
- State transition safety and recovery paths.
- Dynamic context consistency.
- Store subscription hygiene (atomic selectors).
- Hot-path performance and repeated-work elimination.
- Legacy cleanup verification (negative verification).

## Severity Criteria (Mandatory)
- `BLOCKING`:
  - correctness/safety regression,
  - broken contract against current instruction/docs,
  - data-loss or irreversible risk,
  - CI/build/test blocking issue.
- `IMPORTANT`:
  - high-probability bug risk, architecture drift, or notable maintainability debt,
  - not immediately user-breaking but should be fixed in next cycle.
- `IMPROVEMENT`:
  - non-critical optimization or readability/refactor opportunity,
  - no immediate correctness risk.

## Cross-Cutting Quality Gates (Mandatory in Every Phase)
- Workaround/hack audit:
  - identify patch-style or bypass logic,
  - state whether standard primitives/patterns can replace it now.
- Redundancy/dead-code audit:
  - identify duplicated logic, obsolete branches, and unreachable code,
  - require consolidation/removal direction.
- Best-practice compliance:
  - verify implementation matches project standards (routing, state, i18n, component/system rules, DB boundaries).
- Algorithm/complexity audit:
  - for hot paths, provide complexity note (`O(...)`) and expected scale assumption,
  - flag avoidable quadratic or repeated-work patterns.
- Better-implementation check:
  - if a better approach exists, record it explicitly,
  - if not adopted now, include rationale and deferral condition.

## File Coverage Protocol (Mandatory)
- Per phase, build and attach a file inventory table before findings:
  - `File | Classification (major/minor) | Status (Reviewed / Not Applicable / Deferred) | Notes`.
- `Major` files in phase scope must reach `100% Reviewed` before phase approval.
- `Minor` files are not optional when they contain invoked/critical methods:
  - if a major-path method calls into a minor file, reviewer must inspect the called method implementation.
- No “directory-level assumed coverage” is accepted without file-level status.

## Fix SLA (Mandatory)
- `BLOCKING`: must be assigned and fixed in current review cycle before phase approval.
- `IMPORTANT`: must be assigned to the next implementation cycle with explicit owner.
- `IMPROVEMENT`: may be deferred, but must be tracked in instruction/backlog with rationale.

## Evidence Requirements (Mandatory per Finding)
- Each finding must include:
  - reproducible steps,
  - expected vs actual behavior,
  - at least one hard evidence item (test name, command output summary, or concrete code path).

## Finding ID & Risk Score (Mandatory)
- Every finding must use a unique ID:
  - format: `<Phase>-<YYYYMMDD>-<NNN>` (example: `B-20260213-001`).
- Every finding must include risk score:
  - `Impact (1-5) x Likelihood (1-5) = Risk Score (1-25)`.
- Sorting rule in report:
  - primary sort by severity,
  - secondary sort by risk score (descending).

## Duplicate Finding Dedup Rule
- For same root cause across multiple files:
  - create one primary finding,
  - attach related occurrences as references,
  - map to one owner instruction to avoid fragmented backfill.

## Finding Closure Criteria
- A finding is closed only when all are true:
  - code fix merged,
  - verification passed (test/command/manual check as defined),
  - related docs/instructions synchronized when contract changed.

## Definition of Done (Per Phase, Mandatory)
- A phase is `Done` only when all are true:
  - major file coverage reaches 100% and inventory table is attached,
  - all findings have unique ID, owner instruction, and risk score,
  - no unassigned finding remains,
  - required verification commands are executed and recorded,
  - phase verdict is explicit (`APPROVE`/`REJECT`) with rationale.

## Regression Observation Window
- For high-risk fixes (routing/caching/async race/state machine):
  - add observation note in follow-up instruction,
  - monitor for at least the next 2 iterations/commits touching the same path.

## Execution Model
1. Phase-based deep review (not one-shot):
   - Phase A: Foundations (`lib/config`, `lib/fetch`, `lib/storage`, `lib/logger`, `db`).
   - Phase B: Server-state/data flow (`discovery`, query keys, cache, resolver hooks).
   - Phase C: Stores + async state machines (`exploreStore`, `playerStore`, `historyStore`, `filesStore`).
   - Phase D: Route components and user-flow correctness (`podcast/*`, search/explore/library pages).
   - Phase E: Guardrails/tests/tooling (scripts, test gaps, CI protections).
   - Phase F: Build/tooling/config integrity (Vite/Tailwind/TS/PWA/test configs/public assets).
   - Phase G: Docs app + monorepo/root CI/workspace boundary validation.
2. For each phase:
   - Produce findings with severity (`BLOCKING` / `IMPORTANT` / `IMPROVEMENT`).
   - Include concrete file references and failure mode.
   - Include required tests and verification commands.
   - Decide backfill target (`117` / `118` / `119` / new instruction).
   - Include explicit answers for all Cross-Cutting Quality Gates.
3. Gate progression:
   - Do not start next phase until current phase findings are documented and assigned.
4. Phase completion gate:
   - every finding must have one owner instruction ID (`117/118/119/12x`) and verification commands.
   - no unassigned finding may carry into the next phase.

## Backfill Protocol
- If finding matches existing scope:
  - Route/country/error-classification/cache-contract/country-switch stale: append to `117`.
  - Async cancellation/request-id/race/isolation: append to `118`.
  - Legacy resolver/decommission/negative cleanup guardrails: append to `119`.
- If finding is outside `117/118/119`:
  - Create new atomic instruction `12x-*.md` under `agent/instructions/lite/patch/`.
- Never overload an instruction beyond one pass validation size.

## Deliverables Per Phase
1. Review Report Section
   - Decision: `REJECT` or `APPROVE`
   - Findings list by severity
   - Open questions/assumptions
   - Assignment table: `Finding -> Owner Instruction -> Verification Command`
   - Evidence block per finding (repro, expected/actual, proof)
   - Dedup map when multiple occurrences share one root cause
   - File coverage inventory and summary (`major reviewed %`, `minor reviewed %`).
2. Report Output Path (mandatory naming)
   - Phase A: `agent/reviews/lite/120-phase-A-report.md`
   - Phase B: `agent/reviews/lite/120-phase-B-report.md`
   - Phase C: `agent/reviews/lite/120-phase-C-report.md`
   - Phase D: `agent/reviews/lite/120-phase-D-report.md`
   - Phase E: `agent/reviews/lite/120-phase-E-report.md`
   - Phase F: `agent/reviews/lite/120-phase-F-report.md`
   - Phase G: `agent/reviews/lite/120-phase-G-report.md`
   - If a phase is rerun, append `-rN` suffix (example: `120-phase-C-report-r2.md`).
3. Instruction Backfill
   - Updated existing instruction(s) or new `12x` instruction
   - Acceptance criteria + tests + verification commands
4. Doc Sync (if architecture contract changed)
   - EN + ZH updates in affected docs
   - Decision-log update when required

## Required Command Baseline (Each Phase)
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
- Performance or bundle-size related findings:
  - `pnpm -C apps/lite check-size`
- Route topology changes:
  - verify route guards/scripts plus route generation integrity before approval.

## Initial Phase Assignment (Now)
- Already identified:
  - `117`: region-unavailable misclassification + cache contract + country-switch stale protection.
  - `118`: async cancellation integrity + request-id isolation.
  - `119`: legacy country resolver decommission + guardrail expansion.
- Next deep-review pass should start from **Phase A (Foundations)** and continue sequentially.

## Acceptance Criteria
- A full review plan exists with phased coverage and deterministic backfill rules.
- Findings can be traced from report -> instruction -> verification command.
- No “unassigned finding” remains after each phase.
- New findings are either appended to `117/118/119` or captured in a new atomic `12x` instruction.
- Each phase provides file-level coverage inventory with `major reviewed = 100%`.

## Decision Log
- Required: Waived (process instruction only).

## Bilingual Sync
- Not applicable (instruction file only).

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:db-guard`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite lint:route-guards`
  - `pnpm -C apps/lite lint:legacy-route-ban`
  - `pnpm -C apps/lite i18n:check`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
- Date: 2026-02-13
