> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Implement Smoke E2E Tests [COMPLETED]

...

## Completion
Completed by: Readio Worker
Commands: pnpm --filter @readio/lite lint && pnpm --filter @readio/lite typecheck (Execution skipped per user request due to missing browser binaries)
Date: 2026-01-27

## Objective
Add Playwright smoke tests covering the top 3 user journeys to prevent release regressions.

## 1. Test: Home → Play
- **Flow**:
  - Load `/`.
  - Upload a local audio file (fixture).
  - Press Play.
  - Assert playback state changes (e.g., play button toggles or audio element is playing).

## 2. Test: Subscriptions → List
- **Flow**:
  - Seed a subscription via IndexedDB or mocked data.
  - Navigate to `/subscriptions`.
  - Assert list renders and shows the subscription title.

## 3. Test: Files → Playback
- **Flow**:
  - Upload local audio + subtitle.
  - Navigate to `/files`.
  - Click the track to play.
  - Assert subtitle renders and playback starts.

## 4. Test Hygiene
- **Fixtures**: Add small audio and subtitle fixtures under `apps/lite/tests/fixtures/`.
- **Determinism**: Mock network calls; tests must be fully offline-safe.

## 5. Verification
- **Run**: `pnpm --filter @readio/lite test:e2e`.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/testing-guide.mdx`.
- Update `apps/docs/content/docs/general/decision-log.mdx` (mark D007 as implemented).
- Update `apps/docs/content/docs/general/feature-backlog.mdx` (remove or mark the item as completed).
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
