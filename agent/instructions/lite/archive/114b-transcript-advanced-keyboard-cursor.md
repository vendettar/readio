# Task: 114b - Transcript Advanced Keyboard Cursor Mode (Exploratory)

## Precondition (Must)
- `114-accessibility-and-keyboard-nav.md` must be completed and review-signed.

## Objective
Evaluate and implement an advanced transcript keyboard cursor model only after baseline a11y is stable.

## Product Decision (Fixed)
1. This is an advanced follow-up, not baseline scope.
2. Must include a feature flag or guarded rollout path.
3. Must preserve pointer/touch interaction behavior.
4. Must not make every word tabbable.

## Implementation Steps (Execute in Order)
1. Design cursor model and focus strategy document.
2. Implement guarded prototype in transcript components.
3. Add comprehensive keyboard interaction tests for long transcripts.
4. Conduct manual accessibility validation before default-on.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Decision Log
- Required: Yes.

## Bilingual Sync
- Required: Yes.
