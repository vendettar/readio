# Task: 120a (Patch) - Storage Helper Failure Visibility Hardening

## Goal
Improve failure visibility for local/session storage helper write/cleanup operations while preserving non-throwing behavior.

## Source Finding
- `A-20260213-001` from `agent/reviews/lite/120-phase-A-report.md`

## Scope
- `apps/lite/src/lib/storage.ts`
- `apps/lite/src/lib/__tests__/storageQuota.test.ts`
- Add/update tests under `apps/lite/src/lib/__tests__/` if needed.

## Problem
Storage helper mutation/cleanup paths currently swallow exceptions without any diagnostics:
- `setJson`
- `removeItem`
- `clearStorage`
- `clearNamespace`

This reduces debuggability for quota/permission/private-mode failures.

## Requirements
1. Preserve current non-throwing API behavior.
2. Add dev-only structured warning logs for failed storage operations.
3. Include operation + key/prefix context where applicable.
4. Do not log in production mode.
5. Keep helper functions side-effect safe and lightweight.

## Acceptance Criteria
- Storage mutation/cleanup failures remain non-fatal.
- In development mode, failed operations emit diagnostic warnings with operation context.
- Tests cover failure paths and assert logging behavior.

## Required Tests
- `pnpm -C apps/lite test:run src/lib/__tests__/storageQuota.test.ts`

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run src/lib/__tests__/storageQuota.test.ts`

## Decision Log
- Required: Waived (implementation-level observability hardening).

## Bilingual Sync
- Not required unless runtime contract docs are updated.
