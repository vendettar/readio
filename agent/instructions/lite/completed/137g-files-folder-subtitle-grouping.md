---
description: Remove repeated per-track subtitle filtering from the folder page render path
---

# Instruction 137g: Files Folder Subtitle Grouping [COMPLETED]

Goal: Eliminate repeated `subtitles.filter(...)` work inside the folder page render loop by pre-grouping subtitle data by `trackId`.

## Scope
- `apps/lite/src/routeComponents/files/FilesFolderPage.tsx`
- Direct tests or perf-oriented regression coverage for folder rendering logic

## Read First (Required)
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Required Changes
1. Precompute subtitle groups by `trackId` outside the render loop.
2. Preserve current rendering behavior and `TrackCard` props.
3. Add regression coverage or a targeted unit around the grouped mapping contract.
4. Update files-management handoff docs only if the data-flow contract changes materially.

## Acceptance Criteria
- Folder page no longer performs O(tracks * subtitles) filtering inside render.
- Existing track/subtitle rendering behavior remains unchanged.

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
