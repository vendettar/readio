> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Integrate Media Session API

## Objective
Allow the user to control playback from the OS Lock Screen, Control Center, or Hardware Keys.

## 1. Create `useMediaSession` Hook
- **Path**: `apps/lite/src/hooks/useMediaSession.ts`.
- **Implementation**:
  - `navigator.mediaSession.metadata = new MediaMetadata(...)`.
  - Update metadata when `currentTrack` changes (Title, Artist, Artwork).
  - Register handlers:
    ```ts
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', pause);
    navigator.mediaSession.setActionHandler('previoustrack', prev);
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('seekbackward', () => seekRelative(-10));
    navigator.mediaSession.setActionHandler('seekforward', () => seekRelative(30));
    navigator.mediaSession.setActionHandler('seekto', (d) => seek(d.seekTime));
    ```

## 2. Integration
- **Target**: `apps/lite/src/components/AppShell/GlobalAudioController.tsx`.
- **Action**: Call `useMediaSession(currentTrack, actions)`.

## 3. Cleanup
- **Action**: In `useEffect` cleanup, remove handlers (`setActionHandler('play', null)`).

## 4. Verification
- **Test**: Play audio. Lock screen.
- **Check**: You should see the Title/Artwork. Press Pause on lock screen. It should pause.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
