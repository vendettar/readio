> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Integrate Media Session API

## Objective
Allow the user to control playback from the OS Lock Screen, Control Center, or Hardware Keys.

## Design Notes
### Architecture & Data Flow
The Media Session integration is encapsulated in `apps/lite/src/hooks/useMediaSession.ts`, keeping behavior isolated and reusable. `GlobalAudioController` selects current track data (`audioTitle`, `coverArtUrl`, `episodeMetadata?.podcastTitle`) via atomic selectors and passes a compact `currentTrack` object into the hook. Artwork is only sourced from `coverArtUrl` (string or Blob->object URL); if missing, artwork is not set. The hook guards on platform support (`'mediaSession' in navigator`) and updates `navigator.mediaSession.metadata` whenever `currentTrack` changes, setting `title` and `artist` (podcast title only). Action handlers are registered in a `useEffect` with stable callbacks. Those actions call store-backed methods only (no new playback source): `play`, `pause`, `prev`, `next`, `seekRelative`, and `seek`. `seekRelative` reads the latest `progress` and `duration` from `usePlayerStore.getState()` to avoid stale closures and ensure a closed loop with current state. Cleanup clears every handler by setting them to `null` so the OS does not retain controls after unmount or disablement. This preserves the existing UI and makes Media Session a parallel control plane, not a new playback source.

### Error Handling & Edge Cases
The hook safely no-ops on platforms where `navigator.mediaSession` is undefined (SSR/JSDOM and unsupported browsers). When `currentTrack` becomes null (no audio loaded), it clears `navigator.mediaSession.metadata` to avoid stale track info. `seekto` validates `seekTime`: ignores `undefined`/`NaN`, and clamps to `[0, duration]` before calling the store seek action. `seekRelative` reads the latest `progress` and `duration` via `usePlayerStore.getState()`, clamps within `[0, duration]`, and no-ops if `duration === 0`. Action handlers register only when a valid `audioUrl` exists and action callbacks are available. Failures to set metadata or handlers remain silent. Artwork object URLs are revoked by `useImageObjectUrl` cleanup to prevent leaks.

### Testing
Manual verification only. Use any supported platform with Media Session surfaced.

1) Start playback for a track with metadata and artwork. Verify OS surface shows title and podcast title.
2) Trigger `play` and `pause` from OS controls. Playback should start/stop accordingly.
3) Trigger `previoustrack` and `nexttrack`. Verify app behavior matches existing prev/next logic (no new playback source).
4) Trigger `seekbackward` and `seekforward`. Verify progress moves by -10s and +30s, clamped within `[0, duration]`.
5) Trigger `seekto` with a known target time and confirm exact seek, clamped within `[0, duration]`.
6) Artwork coverage:
   - `coverArtUrl` string: artwork appears.
   - `coverArtUrl` Blob: artwork appears via object URL.
   - `coverArtUrl` missing: artwork is not set.
7) No-track regression: with no audio loaded, OS actions do not start playback or change state.
8) Cleanup: unmount or disable media session. OS controls should no longer invoke actions, and metadata should be cleared.

### Documentation Updates
Update handoff documentation:
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`

Bilingual sync required for any `.zh.mdx` counterparts:
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.zh.mdx`

## 1. Create `useMediaSession` Hook
- **Path**: `apps/lite/src/hooks/useMediaSession.ts`.
- **Implementation**:
  - **Architecture**: Dedicated hook (no inline media-session logic in components).
  - **Guard**: No-op if `navigator.mediaSession` is undefined (SSR/JSDOM safe).
  - **Track Source**: Use `audioTitle`, `coverArtUrl`, `episodeMetadata?.podcastTitle` from atomic selectors.
  - **Artist**: Use `episodeMetadata?.podcastTitle` only; no fallback string.
  - **Artwork**: Only from `coverArtUrl` (string URL or Blob via `useImageObjectUrl`); if missing, omit artwork entirely (no placeholder).
  - **Null Track**: When `currentTrack` is null, clear `navigator.mediaSession.metadata`.
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
  - **Handlers**: Register only when a valid `audioUrl` exists and action callbacks are present.
  - **seekto**: Ignore undefined/NaN; clamp to `[0, duration]`.
  - **seekRelative**: Use latest `progress`/`duration` via `usePlayerStore.getState()`, clamp to `[0, duration]`, no-op if `duration === 0`.
  - **Logging**: No dev-only logging; fail silently for unsupported actions.
  - **Cleanup**: Clear all handlers (`setActionHandler(..., null)`) on unmount/disable.
  - **Memory**: Artwork object URLs must be revoked via `useImageObjectUrl` cleanup.

## 2. Integration
- **Target**: `apps/lite/src/components/AppShell/GlobalAudioController.tsx`.
- **Action**: Call `useMediaSession(currentTrack, actions)`.

## 3. Cleanup
- **Action**: In `useEffect` cleanup, remove handlers (`setActionHandler('play', null)`).

## 4. Verification
- **Test**: Play audio. Lock screen.
- **Check**: You should see the Title/Artwork. Press Pause on lock screen. It should pause.
- **Manual**: Verify all handlers (play/pause/prev/next/seekbackward/seekforward/seekto).
- **Artwork**: Verify Blob vs string vs missing coverArtUrl behavior.
- **No Track**: Verify actions do nothing and metadata is cleared when no track is loaded.
- **Cleanup**: Verify handlers are cleared after unmount or route change.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

## Completion
- Completed by: Codex
- Reviewed by: Codex
- Commands: pnpm --filter @readio/lite lint; pnpm --filter @readio/lite typecheck
- Date: 2026-01-26
