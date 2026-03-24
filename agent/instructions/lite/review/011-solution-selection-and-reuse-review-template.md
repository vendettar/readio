# Solution Selection and Reuse Review Template

## Purpose
Review whether implementation choices are the right solution class, avoid unnecessary reinvention, and keep long-term maintenance cost under control.

## Trigger
Use when a feature introduces new infrastructure, custom utilities, custom UI primitives, or non-trivial abstractions.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Changed modules: `{{PATHS}}`
- Existing alternatives checked: `{{LIST libs/components/internal modules}}`

## Required Checks
1. Build-vs-buy decision is explicit and evidence-based (not implicit reinvention)
2. Existing internal component/utility was evaluated before creating a new one
3. Existing framework/platform capability was evaluated before custom implementation
4. Added abstraction has clear net value (complexity added vs complexity removed)
5. No patch-on-patch layering where a focused refactor is the cleaner option
6. New dependency justification is complete (bundle, maintenance, license, security)
7. Exit strategy exists for custom solution (replaceable boundary, migration path)
8. Consistency with project patterns (no second competing pattern for same problem)
9. "Delete test": can 20-30% of new code be removed with no behavior loss? if yes, simplify

## Evidence Checklist (Mandatory)
- Alternatives considered:
  - `{{Option A}}` - `{{why not chosen}}`
  - `{{Option B}}` - `{{why not chosen}}`
- Chosen approach:
  - `{{Approach}}`
  - `{{Expected benefit}}`
  - `{{Cost/Tradeoff}}`
- Reuse opportunities explicitly accepted/rejected:
  - `{{internal reuse candidate}}`
  - `{{external/library candidate}}`

## Findings
- Severity: `P0 | P1 | P2 | P3`
- Title:
- Evidence: `{{PATH:LINE}}`
- Violation type: `reinvention | over_abstraction | patch_layering | unnecessary_dependency | pattern_drift | other`
- Impact:
- Fix Direction:
- Verification:

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- targeted perf/build checks if dependency/abstraction was added

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
