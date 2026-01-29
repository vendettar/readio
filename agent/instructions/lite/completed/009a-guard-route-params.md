> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/apps/lite/routing.mdx` and `apps/docs/content/docs/apps/lite/coding-standards/logic-flow.mdx` before starting.

# Task: Guard Route Params (Folder + Episode)

## Objective
Add lightweight route‑level validation to prevent malformed `folderId` and `episodeId` params from triggering unnecessary DB queries or heavy parsing.

## Decision Log
- **Required / Waived**: Waived (no rule‑doc changes).

## Bilingual Sync
- **Required / Not applicable**: Not applicable.

## Steps
1. Add `beforeLoad` to `apps/lite/src/routes/files/folder/$folderId.tsx`:
   - Validate `folderId` with a simple regex/length guard (UUID‑like: `[a-zA-Z0-9_-]{8,}` or stricter if you prefer).
   - If invalid, redirect to `/files`.
2. Tighten `episodeId` validation in `apps/lite/src/routes/podcast/$id/episode/$episodeId.tsx`:
   - Add a length cap (e.g., `max(200)`).
   - Keep existing `min(1)` or add a safe regex for common GUID/URL shapes.
   - If invalid, redirect to `/explore`.

## Verification
- `pnpm --filter @readio/lite exec tsc --noEmit`
- `pnpm --filter @readio/lite exec biome check .`

---
## Documentation
- No doc updates required.
