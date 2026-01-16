> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Implement Tab Synchronization

## Objective
Ensure only one tab plays audio at a time (Singleton Playback).
If Tab A is playing and user plays in Tab B, Tab A should pause.

## 1. Create `useTabSync` Hook
- **Path**: `apps/lite/src/hooks/useTabSync.ts`.
- **Implementation**:
  - Generate a unique `tabId` on mount using `createId()` from `apps/lite/src/lib/id.ts`.
  - Use `BroadcastChannel('readio_sync')`.
  - When `play()` is called, post `{ type: 'PLAYING', senderId: tabId }`.
  - Listener: If message received AND `senderId !== tabId`, dispatch `PAUSE`.

## 2. Integration
- **Target**: `apps/lite/src/components/AppShell/GlobalAudioController.tsx`.
- **Action**: Call `useTabSync()`.

## 3. Verification
- **Test**: Open Readio in 2 tabs.
- **Test**: Play in Tab 1.
- **Test**: Play in Tab 2.
- **Result**: Tab 1 should pause automatically.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.