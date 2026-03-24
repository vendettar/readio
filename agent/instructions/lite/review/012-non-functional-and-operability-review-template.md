# Non-Functional and Operability Review Template

## Purpose
Review non-functional quality and operational readiness beyond feature correctness: observability, resilience, security/privacy, accessibility, i18n, and release safety.

## Trigger
Use when changes touch user-facing flows, storage/network behavior, auth/credentials, routing, or deployment/runtime config.

## Review Metadata
- Review ID: `{{REVIEW_ID}}`
- Date: `{{YYYY-MM-DD}}`
- Reviewer: `{{NAME}}`
- Related Instruction(s): `{{LIST}}`

## Scope
- Modules/flows: `{{PATHS}}`
- Runtime surfaces: `ui | network | storage | logging | config | build/deploy`

## Required Checks
1. Observability:
   - critical paths emit actionable structured logs
   - error context includes correlation keys (episode/session/track/request)
2. Failure modes and degradation:
   - network/storage/quota/parse failures have explicit behavior
   - fallback paths preserve user actionability (retry/reset/recover)
3. Security and privacy:
   - no secret/API key leakage to logs/UI/storage
   - untrusted inputs are sanitized/validated before rendering/persistence
4. Data quality and contract hardening:
   - invalid payload handling is explicit (`reject | sanitize | quarantine`)
   - no silent coercion that can hide upstream contract drift
5. Accessibility:
   - keyboard navigation and focus management for new UI interactions
   - ARIA semantics and screen-reader labels for controls/states
6. i18n/l10n:
   - no new hard-coded user-facing strings in runtime UI
   - locale-sensitive formatting uses existing i18n/date/number helpers
7. Release and rollback safety:
   - behavior toggles/config defaults are safe
   - rollback path is clear if rollout reveals regressions
8. Performance/resource budgets:
   - no unbounded memory/object URL/timer growth
   - hot paths avoid repeated heavy work without measurable benefit
9. Test quality for NFR:
   - at least one negative-path test for each critical failure domain touched
   - tests verify user-visible fallback semantics, not only internal branches

## Evidence Checklist (Mandatory)
- Failure matrix reviewed:
  - `network failure`: `{{PASS/FAIL + evidence}}`
  - `storage/quota failure`: `{{PASS/FAIL + evidence}}`
  - `invalid payload`: `{{PASS/FAIL + evidence}}`
- Observability anchors reviewed:
  - `{{path:line for key logs/error boundaries}}`
- a11y/i18n checks reviewed:
  - `{{path:line for aria/labels/i18n usage}}`

## Findings
- Severity: `P0 | P1 | P2 | P3`
- Title:
- Evidence: `{{PATH:LINE}}`
- Violation type: `observability_gap | resilience_gap | security_privacy | contract_hardening | a11y | i18n | release_safety | performance_budget | test_gap | other`
- Impact:
- Fix Direction:
- Verification:

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- targeted suites for touched failure modes and UI flows

## Completion
- Completed by:
- Commands:
- Date:
- Reviewed by:
