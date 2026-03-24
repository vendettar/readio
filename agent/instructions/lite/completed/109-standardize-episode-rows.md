# Task: 109 - Superseded (Merged into 102) [COMPLETED]

## Status
This instruction is superseded and must not be executed independently.

## Superseded By
- `agent/instructions/lite/102-unified-episode-row-system.md`

## Reason
`109` and `102` target the same domain (episode-row mapping + interaction unification). Keeping both active creates duplicate implementation paths and review ambiguity.

## Execution Rule
1. Execute `102` only.
2. Do not open parallel implementation work under `109`.
3. If additional episode-row work is required after `102`, create a new atomic follow-up instruction (`109a-*`) with explicit delta scope.

## Scope Preservation
- No direct code changes are authorized by this superseded instruction.
- No separate verification command set is required for `109` itself.

## Documentation Sync
- Keep this redirect file in place as historical mapping.
- If roadmap references `109` as active work, update roadmap to reference `102` instead.

## Completion Condition
`109` is considered resolved when execution ownership is unambiguously moved to `102` and no worker is assigned to implement `109` directly.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `sed -n '1,280p' agent/instructions/lite/109-standardize-episode-rows.md`
  - `rg -n "\\b109\\b|109-standardize-episode-rows|episode-row" apps/docs/content/docs/general/technical-roadmap.mdx`
- Date: 2026-02-14
