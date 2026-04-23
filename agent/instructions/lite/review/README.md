# Lite Review Templates (Index)

## Purpose
Use this directory for periodic code review runs after implementation waves (recommended every 2-3 instructions).

## Structure
- `000-architectural_review.md`
  - Full architectural review template (broad sweep, strongest governance).
- `001-ssot-review-template.md`
  - Single-source-of-truth review (authority split, write/read bypass, drift).
- `002-async-race-and-cancellation-review-template.md`
  - Async race/cancellation review.
- `003-state-transition-integrity-review-template.md`
  - Event/state-machine safety and recoverability review.
- `004-hotpath-performance-review-template.md`
  - Render/data hot-path performance review.
- `005-storage-and-retention-review-template.md`
  - Storage, cleanup, retention, and data integrity review.
- `006-boundary-and-import-governance-review-template.md`
  - Layer boundary/import governance review.
- `007-instruction-lifecycle-compliance-review-template.md`
  - Instruction lifecycle and roadmap/docs sync compliance review.
- `008-patch-diff-review-template.md`
  - Patch/staged-diff focused review (fast, high-signal).
- `009-test-gap-and-regression-review-template.md`
  - Missing tests and regression-risk review.
- `010-track-unified-schema-invariants-review-template.md`
  - Unified `tracks` schema invariant review (sourceType guards, index discipline, cascade integrity).
- `011-solution-selection-and-reuse-review-template.md`
  - Solution selection/reuse review (build-vs-buy, avoid reinvention, abstraction quality, dependency justification).
- `012-non-functional-and-operability-review-template.md`
  - Non-functional/operability review (observability, resilience, security/privacy, a11y, i18n, release safety).

## Archive
- `archive/task120/`
  - Historical Task 120 phase templates and full program docs. Kept for traceability only.

## Recommended Cadence
1. **Every 2-3 instructions**:
   - run `008` (patch diff) + `009` (tests/regression) + one relevant scope template.
2. **Every 6-8 instructions or before milestone merge**:
   - run `000` (full architectural review) + `011` (solution selection/reuse) + `012` (non-functional/operability).
3. **Any foundational refactor**:
   - include `001` + `002` + `003` explicitly.
4. **Any schema/storage refactor (especially unified tables)**:
   - must include `005` + `006` + `008` + `009`.
   - if `tracks`/`sourceType` logic is touched, include `010`.
5. **Any feature that introduces new custom infra/component/abstraction**:
   - must include `011`.
6. **Any user-facing flow change or runtime behavior change**:
   - include `012` explicitly.

## Efficiency Strategy (Default vs Escalation)
To avoid over-review overhead while preserving quality:

1. **Default (daily feature work)**:
   - run `008` + `009` + **one** most relevant scope template.
   - do **not** run heavyweight full-stack review bundles by default.
2. **Conditional escalation (only when triggered)**:
   - add `000` for cross-domain architecture or boundary-shifting changes.
   - add `011` for new custom infra/component/abstraction.
   - add `012` for user-facing flow/runtime behavior changes.
3. **Full review mode (milestones only)**:
   - run broad multi-template coverage (including `000` + `011` + `012`).
   - keep this mode for milestone gates, not routine commits.

## Execution Order View (Operational)
- **Daily default flow**:
  - `008` -> `009` -> choose **one** primary scope template (`001/002/003/004/005/006/010`)
- **Conditional escalation**:
  - add `011` when new custom infra/component/abstraction is introduced
  - add `012` when user-facing flow/runtime behavior changes
- **Milestone/full-review flow**:
  - `000` + `011` + `012` + targeted scope templates based on risk evidence

## Overlap Guidance (De-duplication)
- `001` / `006` / `010` overlap on SSOT, boundary, and discriminator governance.
  - In default mode, pick the one most aligned with the touched area instead of running all three.
- `002` / `003` overlap on async/state integrity.
  - In default mode, choose one as primary and only add the other if race/state-machine risk is explicit.
- Selection rule:
  - In the same review round, select at most one template from each overlap group unless concrete high-risk evidence requires additional coverage.

## Output Convention
- Store concrete review reports under `agent/reviews/lite/`.
- Suggested file name:
  - `YYYYMMDD-<scope>-review.md`
  - example: `20260228-async-race-review.md`

## Finding Format (Unified)
For all templates, findings should use:
- `Severity`: `P0 | P1 | P2 | P3`
- `Title`
- `Evidence`: `path:line`
- `Impact`
- `Fix Direction`
- `Verification`

## Rules
- Templates are policy artifacts; do not mix task-specific implementation details into templates.
- If review output implies code work, create/append implementation instructions under `agent/instructions/lite/`.
- Keep one active implementation instruction at a time when dependency order exists.
- Discriminator/string-literal governance:
  - Domain discriminator values (e.g. `sourceType`, status codes, mode keys) must have one runtime SSOT constant.
  - Review must flag raw repeated string literals as `P2` or above when they affect behavior branching.
  - Runtime branching should prefer typed guards/helpers over ad-hoc string comparisons.
- Readio regression anchors (mandatory when related code is touched):
  - `src/lib/__tests__/downloadService.db.test.ts`
  - `src/lib/repositories/__tests__/DownloadsRepository.test.ts`
  - `src/lib/player/__tests__/remotePlayback.test.ts`
  - `src/routeComponents/__tests__/DownloadsPage.regression.test.tsx`
