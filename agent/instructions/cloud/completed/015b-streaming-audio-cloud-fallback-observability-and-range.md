# Instruction 015b: Streaming Audio Cloud Fallback — Observability + Proxy Range Fix [COMPLETED]

> **⚠️ CRITICAL**: You MUST preserve the current UI/UX layout and styling. Do NOT change visual appearance unless explicitly instructed.

**Reviewed by: Reviewer**

## Goal

Close the two remaining gaps from Instruction 015:

1. **Observability**: Add minimum playback source mode signal (`remote-direct` vs `remote-proxy-fallback`)
2. **Proxy Range forwarding**: Fix GET proxy path to forward Range/If-Range headers so seek works after fallback

## Context

Instruction 015a implemented the core fallback mechanism (bootstrap timeout, host breaker, src swap). Two requirements from the original instruction remain unfulfilled:

### Gap 1: Observability (original instruction lines 307-316)

The instruction requires a minimum debuggable signal to distinguish:
- `remote-direct` — playing from original remote URL
- `remote-proxy-fallback` — playing via `/api/proxy`

Purpose: confirm fallback actually happens, breaker works, no abnormal repeated switching.

### Gap 2: GET proxy Range forwarding

**Root cause**: `apps/cloud-api/main.go` `parseProxyRequest` GET path (line 617-639) creates `headers: make(http.Header)` — it does NOT forward the browser's `Range` or `If-Range` headers to the upstream.

**Impact**: After fallback to `/api/proxy?url=...`, seeking in the audio element will fail because Range requests are not forwarded to the origin server.

**Note**: The POST path DOES forward Range headers (via `validateProxyForwardHeaders` at line 733-757), but the `<audio>` element uses GET for its initial and range requests.

## Implementation Plan

### Part A: Observability

1. Add a `playbackSourceMode` ref to `useRemotePlaybackFallback.ts`:
   - `'direct'` | `'proxy-fallback'` | `null`
   - Set to `'direct'` when bootstrap timeout starts for an eligible remote URL
   - Set to `'proxy-fallback'` whenever `audio.src` is set to a `/api/proxy` URL — regardless of whether triggered by timeout or breaker (proxy-first)
   - Reset to `null` when audioUrl changes (new track)

2. Expose via a module-level getter (not a Zustand store):
   - Export `getPlaybackSourceMode(): 'direct' | 'proxy-fallback' | null` from `useRemotePlaybackFallback.ts`
   - The existing `warn()` log on fallback already exists — verify it includes the mode info

3. Add tests verifying the mode transitions:
   - `null` → `direct` → `proxy-fallback` (timeout path)
   - `null` → `proxy-fallback` (breaker proxy-first path, no `direct` intermediate)
   - Reset to `null` on audioUrl change

### Part B: Proxy GET Range Forwarding

1. In `apps/cloud-api/main.go`, modify the GET case in `parseProxyRequest` (around line 634-639):
   - Read `Range` and `If-Range` from `r.Header` using `r.Header.Get("Range")` and `r.Header.Get("If-Range")`
   - If `Range` is present, validate it against `proxyRangePattern` (same regex used by POST path at line 746). If invalid, return 400.
   - If `Range` is valid (or absent) and `If-Range` is present, add both to the `headers` map before returning the spec.
   - `If-Range` is a trusted conditional header — no regex validation needed, just check it's non-empty.
   - Do NOT call `validateProxyForwardHeaders` — it expects `map[string]string` from POST JSON body. Inline the Range validation using `proxyRangePattern.MatchString()`.

2. Add tests in `main_test.go`:
   - GET proxy with `Range: bytes=0-1023` → forwarded to upstream, response includes `Content-Range`
   - GET proxy with `If-Range: "etag123"` → forwarded to upstream
   - GET proxy with both `Range` + `If-Range` → both forwarded
   - GET proxy with malformed `Range: garbage` → returns 400
   - GET proxy without Range → works as before (no regression)

## Pre-Implementation Scan

Worker must scan:
1. `apps/cloud-api/main.go` — GET proxy handler, header forwarding
2. `apps/cloud-api/main_test.go` — existing proxy tests
3. `apps/cloud-ui/src/hooks/useRemotePlaybackFallback.ts` — current hook state
4. `apps/cloud-ui/src/hooks/__tests__/useRemotePlaybackFallback.test.tsx` — existing tests

## Required Tests

### Frontend (cloud-ui)
1. Playback source mode starts as `null` (no audio)
2. Mode becomes `direct` when eligible remote URL starts playing
3. Mode becomes `proxy-fallback` after timeout triggers switch
4. Mode becomes `proxy-fallback` directly (no `direct` intermediate) when breaker triggers proxy-first
5. Mode resets to `null` when audioUrl changes (new track)

### Backend (cloud-api)
1. GET proxy request with `Range: bytes=0-1023` forwards Range to upstream
2. GET proxy request with `If-Range` forwards it to upstream
3. GET proxy request with both `Range` + `If-Range` forwards both
4. GET proxy request with malformed `Range: garbage` returns 400
5. GET proxy request without Range header works as before (no regression)

## Verification Commands

```bash
pnpm -C apps/cloud-ui test:run -- useRemotePlaybackFallback
pnpm -C apps/cloud-ui lint
pnpm -C apps/cloud-ui typecheck
go test ./apps/cloud-api/... -run 'TestProxyGetRange|TestProxyGet'
```

## Forbidden Approaches

- Do NOT create a new Zustand store slice for playback mode (over-engineering)
- Do NOT change the proxy contract or add new endpoints
- Do NOT modify UI styling or layout
- Do NOT change the POST proxy path (only fix GET)

## Decision Log

- Required

## Bilingual Sync

- Not applicable

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- `apps/cloud-ui/src/hooks/useRemotePlaybackFallback.ts`
- `apps/cloud-ui/src/hooks/__tests__/useRemotePlaybackFallback.test.tsx`
- `apps/cloud-api/main.go` (GET proxy Range forwarding)
- `apps/cloud-api/main_test.go` (new Range forwarding tests)

### Adjacent Critical Files (Spot Check)
- `apps/cloud-api/main.go` (POST proxy path — verify no regression)
- `apps/cloud-ui/src/components/AppShell/GlobalAudioController.tsx`
