# Readio Lite Architectural Review Template

## Purpose
Reusable template for a broad architectural review pass.
Use this when you need one report that covers system boundaries, state safety, async risks, performance, and governance.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Review Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Branch/Commit Range: `{{RANGE}}`
- Related Instruction(s): `{{LIST}}`

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/general/technical-roadmap.mdx`

## Constraint Check
- Constitution alignment: `{{PASS/FAIL + NOTES}}`
- Roadmap sequence alignment: `{{PASS/FAIL + NOTES}}`
- Single active instruction rule: `{{PASS/FAIL + NOTES}}`
- First-release policy alignment: `{{PASS/FAIL + NOTES}}`

## Scope Scan (8 Scopes)
For each scope, fill:
- Status: `Risk | Watch | OK`
- Evidence: `{{PATH:LINE}}`
- Notes: `{{TEXT}}`

1. Config
2. Persistence
3. Routing
4. Logging
5. Network
6. Storage
7. UI State
8. Tests

## Hidden Risk Sweep (Required)
### Async Control Flow
- `{{RISK_1}}`
- `{{RISK_2}}`

### Hot-path Performance
- `{{RISK_1}}`
- `{{RISK_2}}`

## State Transition Integrity (Required)
- Blocking-state risk: `{{PASS/FAIL + NOTES}}`
- Recovery path validity: `{{PASS/FAIL + NOTES}}`

## Dynamic Context Consistency (Required)
- Context keys checked: `{{language/theme/country/provider/model/...}}`
- Stale memo/singleton risk: `{{PASS/FAIL + NOTES}}`

## Discriminator Governance (Required)
- Domain branch keys checked (e.g. `sourceType`, status/mode keys): `{{LIST}}`
- Runtime SSOT constants/guards used (no scattered magic strings): `{{PASS/FAIL + NOTES}}`

## Findings (Primary Output)
Order by severity (`P0` -> `P3`).

### Finding Template
- Severity: `P0 | P1 | P2 | P3`
- Title: `{{SHORT_TITLE}}`
- Evidence:
  - `{{PATH}}:{{LINE}}`
- Impact: `{{TEXT}}`
- Fix Direction: `{{TEXT}}`
- Verification Needed: `{{COMMANDS/TESTS}}`

## Decision Compare
| Option | Cost | Risk | Reversibility | Impact | Select |
|---|---|---|---|---|---|
| `{{A}}` | `L/M/H` | `L/M/H` | `L/M/H` | `L/M/H` | `Yes/No` |
| `{{B}}` | `L/M/H` | `L/M/H` | `L/M/H` | `L/M/H` | `Yes/No` |

## Remediation Mapping
- Finding -> instruction ID mapping
- Execution order / dependency lock
- Confirm single active instruction rule

## Verification Baseline
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build` (phase boundary or milestone review)

## Governance Gate
- Decision Log: `Required | Waived`
- Bilingual Sync: `Required | Not applicable`
- Instruction lifecycle compliance checked: `{{YES/NO}}`

## Completion
- Completed by: `{{NAME}}`
- Commands: `{{LIST}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewed by: `{{NAME}}`
