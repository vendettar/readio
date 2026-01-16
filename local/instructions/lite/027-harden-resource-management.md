> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.
> **Prerequisites**: Read `apps/docs/content/docs/general/design-system.mdx` and `apps/docs/content/docs/apps/lite/ui-patterns.mdx` before starting.

# Task: Harden Resource Management (Memory Leaks)

## Objective
The app plays local files (Blobs). We create `URL.createObjectURL(blob)`. If we don't revoke them, we get massive memory leaks.
**Rule**: Audio URLs must be managed by the Store. Image URLs should be managed by Components.

## 1. Refactor Audio Store (`apps/lite/src/store/playerStore.ts`)
- **Target**: `loadAudio` action.
- **Implementation**:
  - Keep a reference to `currentAudioUrl`.
  - Before creating a new URL, check if `currentAudioUrl` exists. If so, `URL.revokeObjectURL(currentAudioUrl)`.
  - Create new URL: `const url = URL.createObjectURL(blob)`.
  - Save `url` to store state.
- **Constraint**: Do NOT allow components to create audio URLs. The Store is the Single Source of Truth.

## 2. Create Hook for Images (`apps/lite/src/hooks/useImageObjectUrl.ts`)
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

## 3. Verify
- **Test**: Open Chrome Task Manager.
- **Check**: Switch tracks 50 times. Memory usage should remain stable.

### Quality Check
- **Type Check**: Run `pnpm --filter @readio/lite typecheck`.
- **Lint**: Run `pnpm --filter @readio/lite lint`.

---
## Documentation
- If you changed any architectural pattern, update the corresponding doc in `apps/docs/content/docs/`.
- Update `apps/docs/content/docs/apps/lite/handoff.mdx` with the new status.
