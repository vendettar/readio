---
description: Fix country-aware discovery fallback and session restoration identity gaps
---

# Instruction 137c: Discovery + Session Identity Fixes [COMPLETED]

Goal: Preserve country-aware podcast resolution and restore local playback identity consistently.

## Scope
- `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx`
- `apps/lite/src/store/playerStore.ts`
- Direct tests for favorite/add flows and session restore

## Read First (Required)
- `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/search.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
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
- country-context drift during metadata lookup
- local playback flows that depend on restored identity anchors

## Required Changes
1. Pass the active country through the search-episode fallback lookup path.
2. Add regression coverage for non-US fallback resolution.
3. Restore `localTrackId` when restoring local sessions if the persisted session contains that identity.
4. Add regression coverage for local session identity restoration.
5. Reconcile any touched docs so the English and Chinese contracts do not disagree on `localTrackId`.

## Forbidden Dependencies / Required Patterns
- Forbidden: parsing formatted strings or reconstructing country/identity from display output
- Required: exact contract alignment between code and bilingual docs

## Acceptance Criteria
- Search fallback respects current country context.
- Local session restore preserves identity needed by local-only flows.
- Any touched docs describe the same contract in English and Chinese.

## Required Tests
- Non-US search fallback regression test
- Local session restore identity regression test

## Verification Commands
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite typecheck`

## Decision Log
- Waived

## Bilingual Sync
- Required

## Completion
- Completed by: Worker (Codex)
- Commands:
  - `pnpm -C apps/lite test:run`
  - `pnpm -C apps/lite typecheck`
- Date: 2026-03-18
- Reviewed by: Codex
