# Task: 115 - Service Worker Audio Caching Hardening (Phase 1) [COMPLETED]

## Objective
Harden offline audio caching reliability with range-request support and explicit cache policy, without introducing experimental background-fetch flows in this phase.

## Product Decision (Fixed)
1. Phase 1 includes:
   - range-aware audio caching strategy
   - cache partitioning and eviction policy
2. Phase 1 excludes:
   - Background Fetch API orchestration
   - long-running download manager redesign
3. Keep existing app behavior unchanged outside offline/cache reliability.
4. Defer advanced download/background flows to `115b`.

## Scope Scan (Required)
- Config:
  - No breaking runtime config changes.
- Persistence:
  - No DB schema changes.
- Routing:
  - No route changes.
- Logging:
  - Add only minimal service-worker diagnostics if needed.
- Network:
  - No API contract changes.
- Storage:
  - Cache namespace/policy changes in SW cache only.
- UI state:
  - No UI redesign.
- Tests:
  - Add SW strategy tests and manual offline verification checklist.

## Hidden Risk Sweep (Required)
- Async control flow:
  - avoid race conditions between range responses and cache writes.
- Hot-path performance:
  - keep cache lookup/write overhead bounded for large audio files.
- State transition integrity:
  - seeking behavior must remain correct when offline.
- Dynamic context consistency:
  - cache policy must not evict critical metadata unexpectedly.

## Implementation Steps (Execute in Order)
1. **Range-aware audio caching**
   - Update PWA/workbox strategy for audio requests.
   - ensure partial-content (`Range`) behavior is supported for cached assets.

2. **Cache partitioning and policy**
   - separate audio cache from API/static caches.
   - configure bounded retention policy for audio cache.

3. **Validation hooks**
   - add minimal diagnostics to validate cache hit/miss and eviction behavior in dev.

4. **Docs sync (atomic)**
   - update offline/PWA docs with cache strategy and policy details.

## Acceptance Criteria
- Offline seek on cached audio works reliably.
- Audio cache remains bounded by defined policy.
- No regression in online playback behavior.

## Required Tests
1. Add/extend SW strategy tests for audio range handling.
2. Add manual offline verification checklist artifact.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Decision Log
- Required: Yes.

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
