# Instruction 015a: Streaming Audio Cloud Fallback — Implementation [COMPLETED]

> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.

## Goal

Add direct → proxy playback fallback for remote streaming audio in cloud-ui, preserving native streaming semantics (no blob URL, no eager full download).

## Topology Audit (Pre-Read Required)

Read these files before implementing:

- `apps/cloud-ui/src/lib/player/remotePlayback.ts`
- `apps/cloud-ui/src/components/AppShell/GlobalAudioController.tsx`
- `apps/cloud-ui/src/hooks/useAudioElementSync.ts`
- `apps/cloud-ui/src/hooks/useAudioElementEvents.ts`
- `apps/cloud-ui/src/hooks/useAutoplayRetry.ts`
- `apps/cloud-ui/src/hooks/useForegroundAudioPrefetch.ts`
- `apps/cloud-ui/src/store/playerStore.ts`
- `apps/cloud-api/main.go` (proxy GET/Range handling, lines ~510-615, ~744-770)
- `apps/cloud-ui/src/lib/player/__tests__/remotePlayback.test.ts`

## Key Findings (Already Audited)

1. **`<audio>.src` assignment**: Single point — `useAudioElementSync.ts:30` → `audio.src = audioUrl`
2. **`audioUrl` source**: `usePlayerStore` → `GlobalAudioController` → `useAudioElementSync`
3. **Media readiness signals**: `loadedmetadata`, `canplay`, `playing` (NOT `loadstart`)
4. **Track identity**: Held by store state (`audioUrl`, `episodeMetadata`, `sessionId`) — must NOT change on fallback
5. **`/api/proxy` compatibility**: GET ✅, Range ✅, Redirect ✅, HEAD ✅, CORS ✅

## Implementation Plan

### Step 1: Write failing regression tests FIRST

Create `apps/cloud-ui/src/hooks/__tests__/useRemotePlaybackFallback.test.tsx` with:

1. Direct playback succeeds within timeout → no proxy switch
2. Direct playback pending beyond timeout → switches to `/api/proxy?url=...`
3. After proxy switch, no second bootstrap timeout fires
4. Host breaker: after 3 pending timeouts on same host, next play goes proxy-first
5. Blob/local URLs are excluded from bootstrap timeout
6. Fallback does NOT call `setAudioUrl` (track identity preserved)
7. Fallback does NOT create blob URLs

### Step 2: Create `apps/cloud-ui/src/lib/player/remotePlaybackFallback.ts`

Pure logic module (no React, no DOM):

```typescript
// Constants
export const BOOTSTRAP_TIMEOUT_MS = 6000

// Proxy URL builder
export function buildProxyPlaybackUrl(remoteUrl: string): string

// Eligibility check (remote http/https only, not blob/local/proxy)
export function isEligibleForBootstrapFallback(url: string | null | undefined): boolean

// Host extraction
export function extractHost(url: string): string | null

// In-memory host breaker (session-scoped, bounded)
// - recordFailure(host): increment counter
// - shouldProxyFirst(host): true if >= 3 failures
// - reset(): clear all (testing only)
// - Max 50 hosts, evict oldest when full
export const remoteFallbackBreaker: { recordFailure, shouldProxyFirst, reset }
```

### Step 3: Create `apps/cloud-ui/src/hooks/useRemotePlaybackFallback.ts`

React hook with this contract:

**Inputs**: `audioRef`, `audioUrl`, `isPlaying`

**Behavior**:
- Only activates for eligible remote URLs (not blob/local/proxy)
- Only activates when `isPlaying === true`
- Starts bootstrap timeout (6s) after src is set
- Success = `loadedmetadata` or `playing` event fires → clear timeout
- Timeout → switch `audio.src` to `/api/proxy?url=<encoded-remote-url>` + `audio.load()`
- After proxy switch: no second timeout, no auto-switch back
- Check host breaker before starting timeout → skip to proxy-first if threshold met
- Reset all state when `audioUrl` changes (new track)

**Critical rules**:
- Do NOT call `setAudioUrl` on fallback (preserves track identity)
- Do NOT create blob URLs
- Do NOT apply to local/blob/downloaded sources
- Do NOT trigger "new track" side effects

### Step 4: Integrate into `GlobalAudioController.tsx`

Add the hook call after existing hooks:

```typescript
useRemotePlaybackFallback({ audioRef, audioUrl, isPlaying })
```

Place it between `useAudioElementSync` and `useAutoplayRetry`.

### Step 5: Verify `/api/proxy` media playback compatibility

Confirm that the GET proxy handler in `main.go` correctly forwards:
- `Range` headers (for seek)
- `If-Range` headers
- `Accept` headers
- Redirect chains (up to 5)

If anything is missing, note it as a follow-up — do not fix in this pass.

## Required Tests

Minimum test coverage:

1. Direct playback success stays direct (no proxy switch)
2. Pending direct playback switches to proxy after timeout
3. After proxy switch, no second bootstrap timeout
4. Host breaker: 3 failures → proxy-first
5. Blob URLs excluded
6. Local/blob/downloaded sources excluded
7. Fallback does NOT call setAudioUrl
8. Fallback does NOT create blob URLs
9. No regression in audioPrefetch, ASR, downloads

## Verification Commands

```bash
pnpm -C apps/cloud-ui test:run
pnpm -C apps/cloud-ui lint
pnpm -C apps/cloud-ui typecheck
```

## Forbidden Approaches

- Do NOT use `fetch` + blob URL for fallback
- Do NOT call `setAudioUrl` on fallback (breaks track identity)
- Do NOT apply bootstrap timeout to local/blob sources
- Do NOT create a second bootstrap timeout after proxy is active
- Do NOT auto-switch back from proxy to direct for the same session
- Do NOT modify `/api/proxy` in this pass (audit only)
- Do NOT change any UI styling or layout

## Decision Log

- Required

## Bilingual Sync

- Not applicable (code-only change, no docs update in this pass)

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- `apps/cloud-ui/src/lib/player/remotePlaybackFallback.ts`
- `apps/cloud-ui/src/hooks/useRemotePlaybackFallback.ts`
- `apps/cloud-ui/src/components/AppShell/GlobalAudioController.tsx`
- `apps/cloud-ui/src/hooks/__tests__/useRemotePlaybackFallback.test.tsx`

### Adjacent Critical Files (Spot Check)
- `apps/cloud-ui/src/hooks/useAudioElementSync.ts`
- `apps/cloud-ui/src/hooks/useAudioElementEvents.ts`
- `apps/cloud-ui/src/hooks/useAutoplayRetry.ts`
- `apps/cloud-ui/src/hooks/useForegroundAudioPrefetch.ts`
- `apps/cloud-ui/src/store/playerStore.ts`

## Completion

**Completed by**: Readio Worker (Execution Engine)
**Commands**:
- `pnpm -C apps/cloud-ui test:run` — 220 passed, 1 pre-existing failure (unrelated `cloudRuntimeDefaultsContract.test.ts`), 7 skipped
- `pnpm -C apps/cloud-ui lint` — 2 pre-existing errors (unrelated), 0 errors in new files
- `pnpm -C apps/cloud-ui typecheck` — PASS
**Date**: Fri Apr 03 2026

**Reviewed by**: Reviewer
