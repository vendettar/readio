# [COMPLETED] Instruction 127e: Metadata Normalization Feasibility

## Status
- [ ] Active
- [x] Completed

## Goal
Design-only evaluation: decide whether duplicated episode metadata across `PlaybackSession`, `Favorite`, and `PodcastDownload` should be normalized into a central `episodes` table.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/general/technical-roadmap.mdx`

## Context & Policy Alignment
- **First-Release Policy**: "No legacy data migration burden." We are free to drop tables and restructure schemas at zero cost since there are no active users. The decision to normalize must be based purely on **architecture and performance merits**, not migration difficulty.

## Scope Scan (8 Scopes)
- **Config**: No config changes.
- **Persistence**: High impact if normalized (new `episodes` table + FK remap for relation tables).
- **Routing**: No route contract change.
- **Logging**: No direct impact.
- **Network**: No direct impact.
- **Storage**: Medium-high impact. Write flows for history/favorites/downloads would become multi-table transactional (upsert `episode` -> insert `relation`).
- **UI state**: Medium impact. List pages currently map denormalized records directly into UI states.
- **Tests**: High impact. Fixtures and repository tests assume denormalized shapes.

## Architectural Evaluation (IndexedDB Context)
In a traditional SQL database, normalizing metadata into an `episodes` table is standard practice to reduce storage footprint and prevent update anomalies.
However, in our IndexedDB architecture, we face different tradeoffs:
1. **Read Path Complexity**: Normalization in IndexedDB requires manual JS-level joins. While techniques like `bulkGet` or indexed projections can mitigate the N+1 problem, they undeniably increase the complexity of the repository layer for rendering basic list views (History, Favorites).
2. **Storage Cost vs. Developer Velocity**: The duplicated metadata consists of strings (titles, URLs) and numbers (durations). In the Lite context, this text duplication consumes trivial amounts of local storage compared to the primary volume drivers (multi-megabyte audio Blobs).
3. **Transaction Overhead**: Normalization pushes consistency constraints onto the client. Simple user actions (e.g., clicking the "Favorite" button) would require multi-store `rw` transactions to ensure the `episode` record exists before inserting the `favorite` relation.

## Decision Compare
1. **Option A: Full normalization (`episodes` + relation tables)**
   - **Cost**: High (Increases repository/query complexity).
   - **Benefit**: DRY data model; prevents hypothetical edge cases where an episode's title changes after it was favorited.
2. **Option B: Keep denormalized schema (RECOMMENDED)**
   - **Cost**: Minor data redundancy (acceptable in Lite).
   - **Benefit**: Keeps read queries atomic, fast, and simple to maintain.

## Feasibility Conclusion
- **Maintain the denormalized metadata structure for now**.
- While IndexedDB is technically capable of handling relational joins via batching, the engineering effort to implement and maintain those complex queries outweighs the storage savings for strings and URLs. The current architecture's simplicity is the correct choice for this phase of the product.

## Impact Checklist
- **No changes to be executed**. This evaluation affirms the current design.

## Decision Log
- Required: Waived (design-only feasibility, no architecture change executed).

## Bilingual Sync
- Not applicable (instruction file has no `.zh` counterpart).

## Completion
- Completed by: Gemini CLI
- Commands: Evaluated db/types.ts under zero-migration-cost context and IndexedDB NoSQL constraints.
- Date: 2026-02-27
- Reviewed by: Codex
