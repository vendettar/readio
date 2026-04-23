---
description: Harden session restore and lazy library hydration against stale async writes and sticky failures
---

# Instruction 137b: Session + Library State Hardening [COMPLETED]

Goal: Eliminate stale async playback restore writes and ensure lazy library hydration retries after transient failures.

## Scope
- `apps/lite/src/hooks/useSession.ts`
- `apps/lite/src/components/AppShell/GlobalAudioController.tsx`
- `apps/lite/src/store/exploreStore.ts`
- Tests directly covering session restore and library loading

## Read First (Required)
- `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
- `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Scope Scan (Required Before Coding)
Check and report risks across:
1. Config & env parsing
2. Persistence & data integrity
3. Routing & param validation
4. Logging & error handling
5. Network & caching
6. Storage & serialization
7. UI state & hooks
8. Tests & mocks

Also perform a hidden-risk sweep for:
- stale async restore application after track/session changes
- repeated lazy-open flows that stop retrying after transient storage failure

## Required Changes
1. Ensure async progress restore re-validates identity before mutating the shared audio element.
2. Add regression coverage for switching track/session before restore resolution.
3. Ensure `loadSubscriptions()` and `loadFavorites()` do not become permanently loaded-empty after transient failures.
4. Add regression coverage proving a later open retries successfully.
5. Update the relevant handoff sub-docs if the runtime/session contract changes materially.

## Forbidden Dependencies / Required Patterns
- Forbidden: relying on visual behavior alone to prove continuity safety
- Required: targeted race-condition tests
- Required: no state transition may leave the user with permanently empty library data after a transient failure

## Acceptance Criteria
- Stale restore results are ignored once session/audio identity changes.
- Lazy library hydration retries on a later open after an initial IndexedDB failure.
- No redundant await chain blocks current-track interaction.

## Required Tests
- Session restore race regression test
- Library hydration retry regression test

## Verification Commands
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite typecheck`

## Decision Log
- Waived

## Bilingual Sync
- Required if docs are touched

## Completion
- Completed by: Worker (Codex)
- Commands:
  - `pnpm -C apps/lite test:run`
  - `pnpm -C apps/lite typecheck`
- Date: 2026-03-18
- Reviewed by: Codex
