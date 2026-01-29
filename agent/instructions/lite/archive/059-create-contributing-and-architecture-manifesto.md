> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read all documents in `apps/docs/content/docs/` before starting.

# Task: Create Architecture & Contributing Manifesto

## Objective
Codify the "Vibe Coding" and "Instruction-Driven" workflow to ensure any new developer (or Agent) understands the project's unique development philosophy.

## 1. Create `CONTRIBUTING.md`
- **Location**: Project Root.
- **Sections**:
  - **Philosophy**: Instruction-driven development.
  - **State Rule**: "UI reads from Zustand, Actions write to Both."
  - **Commit Rule**: "Update Handoff docs in the same PR."

## 2. Architecture Map
- **Action**: Add a Mermaid diagram to `apps/docs/content/docs/general/monorepo-strategy.mdx` showing the relationship between `apps/docs`, `apps/lite`, and `agent/instructions`.
- **Meta**: If a new manifesto file is added, update `apps/docs/content/docs/general/meta.json` and `apps/docs/content/docs/general/meta.zh.json`.

## 3. Verification
- **Check**: Read the new `CONTRIBUTING.md` and ensure it references the correct doc paths.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/general/improvement-process.mdx`.
- Update `apps/docs/content/docs/general/charter.mdx` (instruction-driven workflow).
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D022 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
