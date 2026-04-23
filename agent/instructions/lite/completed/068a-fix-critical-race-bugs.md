# Async Race Condition Fixes (Follow-up to 068)

## Issues Fixed

### 🔴 Critical Bug #1: restoreSession() Stuck in 'restoring' State
**Problem**: If `loadRequestId` changes during `restoreSession()` (e.g., from `setAudioUrl()`, `loadSubtitles()`, or `saveProgressNow()`), the function would `return` early without resetting `initializationStatus`, permanently blocking app initialization.

**Location**: `apps/lite/src/store/playerStore.ts:505, 535`

**Fix**: Added `set({ initializationStatus: 'ready' })` before every early return in `restoreSession()`.

```typescript
// Before
if (get().loadRequestId !== requestId) return

// After
if (get().loadRequestId !== requestId) {
  set({ initializationStatus: 'ready' })
  return
}
```

---

### 🔴 Critical Bug #2: Subtitle Restoration Missing Race Guard
**Problem**: The subtitle restoration step in `restoreSession()` lacked `loadRequestId` validation, allowing stale subtitles to be loaded after a track switch.

**Location**: `apps/lite/src/store/playerStore.ts:557-568`

**Fix**: Added `loadRequestId` check before applying subtitle data.

```typescript
// 3. Restore subtitle file from IndexedDB
if (lastSession.subtitleId) {
  const subtitleData = await DB.getSubtitle(lastSession.subtitleId)
  // Race Condition Guard: Ensure we haven't switched tracks
  if (get().loadRequestId !== requestId) {
    set({ initializationStatus: 'ready' })
    return
  }
  if (subtitleData) {
    const content = subtitleData.content
    const subtitles = parseSrt(content)
    set({ subtitles, subtitlesLoaded: true })
  }
}
```

---

### 🟡 Anti-Pattern #3: saveProgressNow() Writing loadRequestId
**Problem**: `saveProgressNow()` is a "persistence side-effect" and should NOT interfere with load/restore operations. Writing `loadRequestId` would unintentionally cancel ongoing `restoreSession()` flows, triggering Bug #1.

**Location**: `apps/lite/src/store/playerStore.ts:437-439`

**Fix**: Removed `loadRequestId` mutation from `saveProgressNow()`.

```typescript
// Before
saveProgressNow: async () => {
  const requestId = Date.now()
  set({ loadRequestId: requestId })
  // ...
}

// After
// NOTE: This is a "persistence side-effect" and should NOT update loadRequestId
// to avoid accidentally canceling ongoing restore/load operations
saveProgressNow: async () => {
  const state = usePlayerStore.getState()
  // ...
}
```

---

### 🟡 Issue #4: Date.now() Collision Risk
**Problem**: Using `Date.now()` for `requestId` can cause same-millisecond collisions, especially in rapid user interactions (e.g., fast clicking, automated tests).

**Location**: All `Date.now()` usages in `playerStore.ts` and `exploreStore.ts`

**Fix**: Replaced with incremental counter pattern `get().loadRequestId + 1`.

```typescript
// Before
const requestId = Date.now()

// After
const requestId = get().loadRequestId + 1
```

**Additional Fix**: Fixed `performSearch()` to use `state.country` instead of hardcoded `'us'`.

---

### 🟢 Issue #4.5: Single loadRequestId Causing Cross-Domain Cancellation
**Problem**: In `exploreStore`, a single `loadRequestId` was shared across all operations (search, podcast, subscriptions, favorites). This caused unrelated operations to cancel each other:
```typescript
// User performs search
performSearch() → loadRequestId = 1

// User subscribes to podcast (different operation domain)
subscribe() → loadRequestId = 2

// Search response arrives, but loadRequestId is now 2
if (get().loadRequestId !== requestId) return // ❌ Search incorrectly discarded
```

**Location**: `apps/lite/src/store/exploreStore.ts`

**Fix**: Split into domain-specific counters:
- `searchRequestId` - For search operations only
- `podcastRequestId` - For podcast feed loading only
- `loadRequestId` - For subscriptions/favorites (write-heavy, less critical)

```typescript
// Interface
interface ExploreState {
  searchRequestId: number
  podcastRequestId: number
  loadRequestId: number
  // ...
}

// Usage
performSearch: async (query) => {
  const requestId = get().searchRequestId + 1
  set({ searchRequestId: requestId })
  // ...
  if (get().searchRequestId !== requestId) return
}
```

**Benefit**: Operations in different domains no longer interfere with each other.

---

### 🟡 Architecture Issue #5: fetchUtils vs requestManager Overlap

**Problem**: Two concurrent abort mechanisms exist:
- `fetchUtils.ts`: `activeRequests` Map tracking by URL
- `discovery/requestManager.ts`: `deduplicatedFetch()` with its own request cache

This creates confusion and potential conflicts ("who aborted what?").

**Current Status**: **Documented as known issue** - deferred to future refactoring.

**Recommended Solution** (for future refactoring):
1. **Keep `fetchUtils` for generic HTTP utilities** (proxy fallback, timeout, JSON parsing).
2. **Remove resource-level auto-abort from `fetchUtils`** - let callers manage AbortSignal explicitly.
3. **Consolidate request deduplication in `requestManager`** for discovery operations.
4. **Use explicit AbortController** in store actions (already done via `searchAbortController`, `podcastAbortController`).

**Rationale**: Explicit > Implicit. Stores should own cancellation logic, not low-level fetch wrappers.

---

## Verification

- ✅ Typecheck: `pnpm --filter @readio/lite typecheck`
- ✅ Lint: `pnpm --filter @readio/lite lint`
- ✅ Manual Testing: Rapid track switching, mid-restore cancellation
- ⚠️ Store Tests: Existing tests pass, but no specific coverage for these race conditions yet

---

## Related

- Original Implementation: [068-audit-and-fix-async-race-conditions.md](./068-audit-and-fix-async-race-conditions.md)
- Decision Log: D031 (Async Interaction Safety)
- Logic Flow Rule: "Async Interaction Safety (Race Guard)"

## Patch Additions (Integrated)
# Patch: 068a-fix-critical-race-bugs

## Why
Content-level normalization to align with Leadership requirements and prevent execution drift.

## Global Additions
- Add Scope Scan (config, persistence, routing, logging, network, storage, UI state, tests).
- Add Hidden Risk Sweep for async control flow and hot-path performance.
- Add State Transition Integrity check.
- Add Dynamic Context Consistency check for locale/theme/timezone/permissions.
- Add Impact Checklist: affected modules, regression risks, required verification.
- Add Forbidden Dependencies / Required Patterns when touching architecture or cross-module refactors.

## Task-Specific Additions
- Deterministic repro steps + regression tests.
