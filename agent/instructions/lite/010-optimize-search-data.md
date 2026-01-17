> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Optimize Search Algorithms (Data Layer)

## Objective
Ensure the underlying search queries (Dexie & API) are O(log N) and efficient.
This task focuses on the **Data Layer**. The UI layer will be refactored to `cmdk` in a separate task.

## 1. Audit Dexie Indexes (`apps/lite/src/lib/dexieDb.ts`)
- **Action**: Check the schema for `playbackSessions` and `fileTracks`.
- **Requirement**: `title` and `name` fields MUST be indexed.
  ```ts
  // Example schema
  playbackSessions: 'id, title, ...' // 'title' must be here
  fileTracks: 'id, name, ...' // 'name' must be here
  ```
- **Action**: Check `searchPlaybackSessionsByTitle` implementation.
  - ❌ Bad: `.filter(item => item.title.includes(query))` (Table Scan)
  - ✅ Good: `.where('title').startsWithIgnoreCase(query)` (Index Scan)
  - **Refactor**: If it's a table scan, refactor to use Index or compound index.
  - **Reset**: If schema changes, follow the DB reset policy (no migrations).

## 2. Refine Search Hook Logic (`apps/lite/src/hooks/useGlobalSearch.ts`)
- **Action**: Ensure the hook exposes a clear `search(query)` function or reactive query state that can be easily consumed by the UI.
- **Optimization**: Distinguish between "Local Search" (fast) and "Remote Search" (slow).
  - The hook should ideally return local results immediately while remote results load.

## 3. Verify
- **Test**: Populate DB with 1000 items (mock data).
- **Check**: Calling `DB.search...` directly should return in < 10ms.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/features/search.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/database.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
