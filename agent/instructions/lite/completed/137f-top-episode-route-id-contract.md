---
description: Replace top-episode route construction that parses formatted URLs with a structured podcast identity contract
---

# Instruction 137f: Top-Episode Route ID Contract [COMPLETED]

Goal: Stop deriving podcast route IDs from formatted episode URLs and use structured episode/podcast identity instead.

## Scope
- `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx`
- `packages/core/src/schemas/discovery.ts`
- `apps/lite/src/lib/discovery/providers/apple.ts`
- Direct tests covering episode route generation

## Read First (Required)
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/discovery.zh.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Required Changes
1. Add or use a structured podcast identifier on top-episode data instead of regex-parsing `episode.url`.
2. Update the Apple mapping layer and shared schema so the route-building consumer receives that identifier directly.
3. Add regression coverage for valid episode data whose URL does not match `/id123...`.
4. Update discovery handoff docs if the data contract changes.

## Acceptance Criteria
- Top-episode navigation still works when `episode.url` is relative or non-canonical.
- No route-building logic depends on parsing display/formatted URLs.

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
