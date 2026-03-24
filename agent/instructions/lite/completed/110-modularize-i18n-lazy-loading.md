# Task: 110 - Superseded (Merged into 100) [COMPLETED]

## Status
This instruction is superseded and must not be executed independently.

## Superseded By
- `agent/instructions/lite/100-modularize-i18n-optimization.md`

## Reason
`110` duplicates i18n modularization/lazy-loading goals already fully specified in `100`, and introduces conflicting implementation options (`i18next-http-backend` vs in-repo module loaders).

## Execution Rule
1. Execute `100` only.
2. Do not implement i18n lazy-loading changes from `110`.
3. If follow-up optimization is needed after `100`, create a new atomic instruction (`110a-*`) with non-overlapping scope.

## Scope Preservation
- No direct code changes are authorized by this superseded instruction.
- No separate verification command set is required for `110` itself.

## Documentation Sync
- Keep this redirect file as a de-duplication marker.
- If roadmap references `110` as active work, update roadmap to reference `100` instead.

## Completion Condition
`110` is considered resolved when i18n implementation work is tracked exclusively by `100` (or its explicit follow-ups), with no worker executing `110` directly.

## Completion
- Completed by: Codex
- Commands:
  - `sed -n '1,180p' agent/instructions/lite/110-modularize-i18n-lazy-loading.md`
- Date: 2026-02-14
