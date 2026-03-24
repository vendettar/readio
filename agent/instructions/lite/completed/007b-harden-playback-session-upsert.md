> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/handoff/architecture.mdx` and `apps/docs/content/docs/apps/lite/coding-standards/state-management.mdx` before starting.

# Task: Harden Playback Session Upsert (Prevent Progress Loss) [COMPLETED]

## Objective
Prevent accidental overwrites of existing playback sessions when re‑creating fixed session IDs (e.g., `local-track-${id}`), preserving progress/duration and metadata.

## Decision Log
- **Required / Waived**: Waived (no rule‑doc changes).

## Bilingual Sync
- **Required / Not applicable**: Not applicable.

## Steps
1. Update `apps/lite/src/lib/dexieDb.ts`:
   - Add a new helper `upsertPlaybackSession(data: Partial<PlaybackSession>)`.
   - If `data.id` exists and a record is found, merge fields and **preserve existing progress/duration/lastPlayedAt** unless explicitly provided in `data`.
   - If no record exists, fall back to the current `createPlaybackSession` defaults.
2. Update `apps/lite/src/hooks/useFilePlayback.ts`:
   - Replace `DB.createPlaybackSession` with `DB.upsertPlaybackSession` when using `local-track-${track.id}`.
   - Ensure `progress` and `duration` are not reset on re‑play.
3. (Optional) Update `apps/lite/src/hooks/useSession.ts` to use the new upsert helper for consistency if it also creates sessions.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- Updated `apps/docs/content/docs/apps/lite/handoff/database.mdx` with "Session Hardening" section.
- Updated `apps/docs/content/docs/general/technical-roadmap.mdx` marking 007b as completed.

## Completion
- **Completed by**: Antigravity (Execution Engine)
- **Commands**: `pnpm --filter @readio/lite exec tsc --noEmit && pnpm --filter @readio/lite exec biome check .`
- **Date**: 2026-01-20

## Patch Additions (Integrated)
# Patch: 007b-harden-playback-session-upsert

## Why
Content-level normalization to align with Leadership requirements and prevent execution drift.

## Global Additions
- Add Scope Scan (config, persistence, routing, logging, network, storage, UI state, tests).
- Add Hidden Risk Sweep for async control flow and hot-path performance.
- Add State Transition Integrity check.
- Add Dynamic Context Consistency check for locale/theme/timezone/permissions.
- Add Impact Checklist: affected modules, regression risks, required verification.
- Add Forbidden Dependencies / Required Patterns when touching architecture or cross-module refactors.

## Task-Specific Additions
- Add invariant list for session upsert transitions.
