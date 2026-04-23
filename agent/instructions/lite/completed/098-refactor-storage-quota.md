# Task: 098 - Refactor Storage Quota Logic into Pure Policy + Side-Effect Orchestrator [COMPLETED]

## Objective
Refactor storage-quota logic into a pure policy module and keep side effects in one orchestrator module, while preserving current user-visible behavior exactly.

## Product Decision (Fixed)
1. Add one pure policy module: `apps/lite/src/lib/storageQuotaPolicy.ts`.
2. Keep `apps/lite/src/lib/storageQuota.ts` as the only side-effect orchestrator (DB reads, storage I/O, toast, runtime config reads).
3. Preserve existing public API in `storageQuota.ts`:
   - `checkStorageQuota(options?)`
   - `evaluateUploadGuardrails(files)` returning `{ blocked: boolean }`
4. Preserve existing thresholds and semantics exactly:
   - warning threshold `0.8`
   - block threshold `0.85`
   - hard block threshold `0.95`
   - audio-cap enforcement via `MAX_AUDIO_CACHE_GB`
5. Preserve existing quota-warning dedupe contract:
   - session-level crossing warning only once per session
   - same sessionStorage keys remain authoritative.
6. Preserve existing toast keys and when they fire:
   - `storageQuotaWarning`
   - `storageQuotaUploadBlocked`
7. No UI redesign and no settings workflow changes in this instruction.
8. Preserve numeric unit contract exactly:
   - `computeQuotaPercentage` returns percent in `0..100` scale (not `0..1`).
   - `shouldWarnOnCrossing` inputs (`percent`, `lastPercent`) are interpreted in `0..100` scale.
9. Preserve best-effort behavior when browser quota is unavailable:
   - if browser quota info is missing or `quota <= 0`, upload guardrail result remains non-blocking (`{ blocked: false }` externally).
10. Preserve concurrent check dedupe semantics exactly:
   - while `quotaCheckInFlight` exists, subsequent calls reuse the same in-flight promise (no secondary branch evaluation).

## Scope Scan (Required)
- Config:
  - No runtime env contract changes.
- Persistence:
  - No schema changes.
- Routing:
  - No route changes.
- Logging:
  - No logging contract changes.
- Network:
  - No network changes.
- Storage:
  - Keep current sessionStorage/localStorage key behavior unchanged.
- UI state:
  - No Settings UI or interaction changes.
- Tests:
  - Add policy-level unit tests and keep integration tests passing.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Keep `quotaCheckInFlight` dedupe behavior to avoid concurrent duplicate warning checks.
- Hot-path performance:
  - Keep policy functions pure and allocation-light for repeated file-ingest paths.
- State transition integrity:
  - Blocking and warning transitions must remain deterministic across repeated checks.
- Dynamic context consistency:
  - `MAX_AUDIO_CACHE_GB` must still be read at evaluation time through runtime config, not cached at module init.

## Implementation Steps (Execute in Order)
1. **Create pure quota policy module**
   - Add:
     - `apps/lite/src/lib/storageQuotaPolicy.ts`
   - Move pure computation there:
     - `computeQuotaPercentage`
     - `shouldWarnOnCrossing`
     - `shouldBlockUpload`
   - Unit contract (required):
     - `computeQuotaPercentage` output unit is `0..100`.
     - `shouldWarnOnCrossing` must compare values in `0..100` space against `QUOTA_WARNING_THRESHOLD * 100`.
   - Add one pure decision helper:
     - `evaluateUploadGuardrailPolicy(input)`
   - Required input fields:
     - `audioCacheCapBytes`
     - `audioBlobsSize`
     - `incomingAudioSize`
     - `incomingTotalSize`
     - `browserUsage`
     - `browserQuota`
   - Required output shape:
     - `{ blocked: boolean; reason: 'none' | 'audio-cap' | 'quota-block-threshold' | 'quota-hard-threshold' }`
   - Required missing-quota behavior:
     - when quota is unavailable/invalid in policy input, return `{ blocked: false; reason: 'none' }`.

2. **Refactor orchestrator module**
   - Update:
     - `apps/lite/src/lib/storageQuota.ts`
   - Keep side effects in this file only:
     - DB reads (`DB.getStorageInfo`)
     - runtime config read (`getAppConfig`)
     - sessionStorage reads/writes (`getJson`/`setJson`)
     - toasts
     - error logging
   - Consume policy module for all branching decisions.
   - Keep existing exports stable and behavior-preserving.
   - Keep in-flight dedupe behavior unchanged:
     - concurrent `checkStorageQuota` calls must share one promise path and must not introduce a second mode-specific branch during in-flight execution.

3. **Preserve compatibility exports**
   - Continue exporting `computeQuotaPercentage`, `shouldWarnOnCrossing`, and `shouldBlockUpload` from `storageQuota.ts` for existing imports/tests.
   - Implement these exports as pass-through wrappers to policy module functions.

4. **Keep upload guardrail external contract unchanged**
   - `evaluateUploadGuardrails(files)` must still return `{ blocked: boolean }` only.
   - Internal decision reason is used inside `storageQuota.ts` only to decide toast behavior and tests.

5. **Tests for policy and orchestration parity**
   - Add new pure-policy test file.
   - Update existing integration tests to assert behavior parity after refactor.

6. **Docs sync (atomic)**
   - Update persistence docs to reflect architectural split:
     - pure policy module vs side-effect orchestrator
     - user-visible behavior unchanged.

## Acceptance Criteria
- Upload blocking behavior remains unchanged for all existing threshold scenarios.
- Warning crossing behavior remains unchanged and still warns once per session.
- `evaluateUploadGuardrails(files)` still returns `{ blocked: boolean }`.
- Existing toast keys fire in the same scenarios as before.
- Quota logic no longer mixes pure policy branching and side effects in one file.

## Required Tests
1. Add:
   - `apps/lite/src/lib/__tests__/storageQuotaPolicy.test.ts`
   - Cover:
     - percentage computation
     - warning-crossing logic
     - quota block threshold
     - hard threshold projection
     - audio-cap blocking precedence
2. Update:
   - `apps/lite/src/lib/__tests__/storageQuota.test.ts`
   - Keep existing assertions and add:
     - `checkStorageQuota({ mode: 'silent' })` does not emit warning toast
     - concurrent `checkStorageQuota` calls dedupe DB reads in-flight
     - concurrent `checkStorageQuota` mode-mix (`silent` + `user`) keeps existing single in-flight execution semantics
     - `evaluateUploadGuardrails` still returns `{ blocked: boolean }` contract
3. Keep related ingestion tests green:
   - `apps/lite/src/hooks/__tests__/useFileHandler.test.ts`
   - `apps/lite/src/hooks/__tests__/useFileProcessing.test.ts`

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/storageQuotaPolicy.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/storageQuota.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useFileHandler.test.ts`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useFileProcessing.test.ts`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/storageQuotaPolicy.ts` (new)
  - `apps/lite/src/lib/storageQuota.ts`
  - `apps/lite/src/lib/__tests__/storageQuotaPolicy.test.ts` (new)
  - `apps/lite/src/lib/__tests__/storageQuota.test.ts`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/database.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/files-management.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/files-management.zh.mdx`
- Regression risks:
  - accidental drift in warning/block thresholds
  - accidental change in session-warning dedupe behavior
  - accidental public API contract change for `evaluateUploadGuardrails`
- Required verification:
  - policy tests pass
  - storage quota integration tests pass
  - full lite test suite passes
  - lite build passes

## Forbidden Dependencies
- Do not add new storage libraries.
- Do not add new global state for quota.
- Do not add migration/backfill logic.

## Required Patterns
- Pure calculations in `storageQuotaPolicy.ts` only.
- Side effects in `storageQuota.ts` only.
- Keep current translation key contracts and toast timing behavior.

## Decision Log
- Required: No (behavior-preserving structural refactor).

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex (GPT-5)
- Reviewed by: Codex (GPT-5)
- Commands:
  - `cd apps/lite && pnpm lint`
  - `cd apps/lite && pnpm lint:selectors`
  - `cd apps/lite && pnpm typecheck`
  - `cd apps/lite && pnpm vitest run src/lib/__tests__/storageQuotaPolicy.test.ts`
  - `cd apps/lite && pnpm vitest run src/lib/__tests__/storageQuota.test.ts`
  - `cd apps/lite && pnpm vitest run src/hooks/__tests__/useFileHandler.test.ts`
  - `cd apps/lite && pnpm test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-13
