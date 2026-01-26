> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system/index.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns/index.mdx` before starting.

# Task: Harden Resource Management (Memory Leaks)[COMPLETED]

## Objective
The app plays local files (Blobs). We create `URL.createObjectURL(blob)`. If we don't revoke them, we get massive memory leaks.
**Rule**: Audio URLs must be managed by the Store. Image URLs are managed by Components.

## 1. Audit All ObjectURL Call Sites
- **Search**: `rg "createObjectURL" apps/lite/src`.
- **Rule**: Only the Store may create audio ObjectURLs. Components may only create image ObjectURLs via the hook below.
- **Fix**: Move any audio ObjectURL creation into the Store and ensure cleanup.

## 2. Refactor Audio Store (`apps/lite/src/store/playerStore.ts`)
- **Target**: `loadAudio` action.
- **Implementation**:
  - Keep a reference to `currentAudioUrl`.
  - Before creating a new URL, check if `currentAudioUrl` exists. If so, `URL.revokeObjectURL(currentAudioUrl)`.
  - Create new URL: `const url = URL.createObjectURL(blob)`.
  - Save `url` to store state.
- **Constraint**: Do NOT allow components to create audio URLs. The Store is the Single Source of Truth.

## 3. Create Hook for Images (`apps/lite/src/hooks/useImageObjectUrl.ts`)
- **Scope**: For Artwork only.
- **Implementation**:
  ```ts
  export function useImageObjectUrl(blob: Blob | null) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
      if (!blob) return;
      const newUrl = URL.createObjectURL(blob);
      setUrl(newUrl);
      return () => URL.revokeObjectURL(newUrl); // Auto-cleanup on unmount
    }, [blob]);
    return url;
  }
  ```

## 4. Verify
- **Test**: Open Chrome Task Manager.
- **Check**: Switch tracks 50 times. Memory usage should remain stable.
 - **Check**: `rg "createObjectURL" apps/lite/src` shows no direct component usage for audio.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- Update `apps/docs/content/docs/apps/lite/performance.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`.
- Update `apps/docs/content/docs/apps/lite/handoff/index.mdx` with the new status.

---
## Completion
- **Status**: Completed
- **Date**: 2026-01-26
- **Commands**: `pnpm --filter @readio/lite lint`, `pnpm --filter @readio/lite typecheck`
- **Reviewed by**: Antigravity Agent
