# Instruction 127d3: UI, Tests, Docs, And Cleanup [COMPLETED]

## Status
- [ ] Active
- [x] Completed

## Hard Dependencies
- `agent/instructions/lite/127d2-runtime-consumer-cutover.md` must be completed and reviewed.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`

## Goal
Finish unification rollout by:
1. Updating UI-facing wiring and regression tests.
2. Removing residual dual-store runtime references.
3. Synchronizing handoff/docs + decision log.

## Scope
- `apps/lite/src/routeComponents/**`
- `apps/lite/src/components/**`
- `apps/lite/src/routeComponents/**/__tests__/*`
- `apps/lite/src/components/**/__tests__/*`
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `agent/instructions/lite/127d-schema-unification-feasibility.md`

## Scope Scan (8 Scopes)
- Config:
  - No config key change expected.
- Persistence:
  - No new schema change in this slice; consume settled `127d1/127d2` contract only.
- Routing:
  - Route entry behavior in Files/Downloads/History must remain unchanged.
- Logging:
  - UI/logging labels must remain compatible with existing diagnostics.
- Network:
  - No network behavior change.
- Storage:
  - Validate no residual runtime references to dual stores remain.
- UI state:
  - High impact: list selection/playback affordances must stay stable.
- Tests:
  - High impact: full regression coverage is required for route components and playback flows.

## Product Decisions (Locked)
1. UI behavior must remain unchanged from user perspective.
2. Docs must reflect unified `tracks` contract exactly.
3. `handoff/index*.mdx` status-only updates; no implementation details in index pages.

## Hidden Risk Sweep
- Async:
  - UI list refresh and playback transitions must not temporarily bind stale subtitle/track references.
- Hot path:
  - Avoid introducing extra render-time lookups in list rows after repository cutover.

## State Transition Integrity
1. UI actions must always keep a recovery path from mini/docked/full playback surfaces.
2. Files/Downloads/History navigation must not place player in an action-blocking state after cutover.

## Dynamic Context Consistency
1. UI projections over unified tracks must update correctly when language/country settings change.
2. Docs must not encode stale legacy table names in any localized variant.

## Acceptance Criteria
1. Files/Downloads/History UI flows remain correct under unified `tracks`.
2. No residual non-test runtime references to `local_tracks` / `podcast_downloads`.
3. Database handoff docs (EN/ZH) are synchronized with code.
4. Decision log contains one entry documenting dual-store -> unified-track decision and risk notes.
5. Parent `127d` completion metadata is updated only after review sign-off.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`
- `bash -lc "if rg -n '\\b(local_tracks|podcast_downloads)\\b' apps/lite/src --glob '!**/__tests__/**' --glob '!**/tests/**'; then echo 'legacy dual-track store reference found after cleanup' && exit 1; fi"`

## Decision Log
- Required: Yes.
- Must append to:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`
- Entry must include:
  - selected option and rationale
  - risk profile
  - explicit first-release note: no migration/backfill strategy is required

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/routeComponents/**`
  - `apps/lite/src/components/**`
  - route/component tests
  - handoff docs + decision log (EN/ZH)
- Regression risks:
  - UI playback behavior drift in Files/Downloads/History.
  - Docs/code mismatch for unified `tracks` contract.
- Required verification:
  - All verification commands pass.
  - Manual smoke confirms Files/Downloads/History playback and subtitle switching.

## Completion
- Completed by: Gemini CLI
- Commands: Evaluated UI code, docs, schemas. Fixed testing errors and updated handoff/decision log.
- Date: 2026-02-27
- Reviewed by: Codex
