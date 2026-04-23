---
description: Harden pause semantics for dictionary lookup actions
---

# Instruction 134a: Pause On Dictionary Lookup - Behavior Hardening [COMPLETED]

Goal: make pause behavior deterministic for dictionary lookup actions, without altering unrelated selection behavior.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/lite/src/lib/schemas/settings.ts`
- `apps/lite/src/hooks/selection/useSelectionActions.ts`
- `apps/lite/src/hooks/selection/__tests__/useSelectionActions.test.ts`
- `apps/lite/src/lib/__tests__/settings.snapshot.test.ts`

## Scope Scan Report (8 Required Scopes)
- Config: Medium risk. Keep fail-closed default (`pauseOnDictionaryLookup: true`).
- Persistence: Medium risk. Snapshot/persist precedence must remain deterministic.
- Routing: Low risk. No route or navigation mutation.
- Logging: Low risk. No new logging required.
- Network: Low risk. Dictionary fetch stays unchanged.
- Storage: Low risk. No schema migration required.
- UI state: High risk. Lookup action sequencing can over-trigger pause.
- Tests: High risk. Must verify exactly-once semantics and non-lookup exclusion.

## Implementation Scope
- `apps/lite/src/hooks/selection/useSelectionActions.ts`
- `apps/lite/src/hooks/selection/__tests__/useSelectionActions.test.ts`
- `apps/lite/src/lib/__tests__/settings.snapshot.test.ts`
- `apps/lite/src/routeComponents/SettingsPage.tsx` and tests only if needed
- locale files:
  - `apps/lite/src/lib/locales/en.ts`
  - `apps/lite/src/lib/locales/zh.ts`
  - `apps/lite/src/lib/locales/de.ts`
  - `apps/lite/src/lib/locales/es.ts`
  - `apps/lite/src/lib/locales/ja.ts`
  - `apps/lite/src/lib/locales/ko.ts`

## Required Changes
1. Lookup-triggered pause executes exactly once per user-triggered lookup action.
2. Non-lookup actions (`copy`, `search web`, plain selection open/close) never call pause.
3. Both lookup entry paths remain equivalent:
   - direct transcript word lookup
   - lookup from context menu
4. Abort/retry does not add extra pause calls.
5. Setting read uses latest snapshot/state path (no stale closure capture).
6. Ensure i18n keys exist in all six locale files:
   - `settingsDictionary`
   - `settingsDictionaryDesc`
   - `settingsPauseOnLookup`

## Hidden Risk Sweep
- Async control flow: stale lookup promises must not trigger duplicate pause.
- State transition integrity: lookup open must not leave context menu in blocking mode.
- Dynamic context consistency: toggle reads latest setting, not mount-time value.
- Hot-path performance: no extra subscriptions or repeated expensive reads.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite i18n:check`
- `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionActions.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/settings.snapshot.test.ts`

## Acceptance Criteria
1. Lookup + toggle on => pause called once.
2. Lookup + toggle off => pause not called.
3. Non-lookup actions => pause not called.
4. Overlapping/retried lookup flow => no duplicate pause calls.
5. i18n keys exist and check passes.

## Impact Checklist
- Affected modules:
  - selection action/pause side effect
  - settings snapshot semantics
  - locale dictionaries
- Regression risks:
  - accidental pause for non-lookup interactions
  - stale setting read causing inconsistent behavior
  - missing locale keys breaking i18n gate
- Required verification:
  - all commands above pass
  - manual smoke from transcript tap + context-menu lookup

## Required Patterns / Forbidden Dependencies
- Required patterns:
  - reuse existing shared `Switch`
  - fail-closed default for `pauseOnDictionaryLookup`
- Forbidden dependencies:
  - no duplicate switch implementation
  - no route-layer coupling for lookup pause behavior

## Decision Log
- Required: Waived (behavior hardening only; no architecture pivot).

## Bilingual Sync
- Required: Yes.
- Update:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite test:run -- src/hooks/selection/__tests__/useSelectionActions.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/settings.snapshot.test.ts`
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite i18n:check`
- Date: 2026-03-10
