> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

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
  - **Fallback**: If `BroadcastChannel` is unavailable, use `storage` events with a `localStorage` key (`readio_sync`) to broadcast the same payload.
  - **Feedback Guard**: Include `timestamp` and ignore events older than 2 seconds. Ignore events originating from the current tab.

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
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/standards.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.
