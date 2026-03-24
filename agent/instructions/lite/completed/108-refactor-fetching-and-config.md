# Task: 108 - Split Fetch/Config Internals with Stable Public APIs (Phase 1) [COMPLETED]

## Objective
Reduce risk in critical network/config modules by extracting internal submodules while preserving existing public APIs and runtime behavior.

## Product Decision (Fixed)
1. This instruction is **Phase 1 only**:
   - internal module extraction.
   - no external API signature changes.
2. Keep public entry APIs unchanged:
   - `apps/lite/src/lib/fetchUtils.ts`
   - `apps/lite/src/lib/runtimeConfig.ts`
3. Extract fetch internals into `apps/lite/src/lib/networking/`:
   - `proxyUrl.ts` (URL normalization and build logic)
   - `circuitBreaker.ts` (state and policy)
   - `timeouts.ts` (timeout helpers / abort wiring)
4. Extract runtime-config internals into:
   - `apps/lite/src/lib/runtimeConfig.defaults.ts`
   - `apps/lite/src/lib/runtimeConfig.schema.ts`
5. Keep behavior contracts unchanged:
   - proxy fallback order
   - timeout behavior
   - circuit-breaker trip/reset rules
   - runtime env fallback and validation behavior.
6. Circuit-breaker strategy is frozen to current production behavior:
   - If current behavior is record-only (no pre-request short-circuit), keep record-only.
   - If current behavior includes short-circuit, preserve existing short-circuit gates exactly.
   - This instruction may extract internals only, not change breaker policy.

## Scope Scan (Required)
- Config:
  - No env key contract changes.
- Persistence:
  - No schema/storage changes.
- Routing:
  - No route changes.
- Logging:
  - Keep existing runtimeConfig/fetch logging semantics.
- Network:
  - No endpoint contract changes.
- Storage:
  - No localStorage/IndexedDB key changes.
- UI state:
  - No UI changes.
- Tests:
  - Keep fetch/runtime config tests passing and add extracted-module unit tests.

## Hidden Risk Sweep (Required)
- Async control flow:
  - Abort and timeout logic must preserve existing ordering and cleanup.
- Hot-path performance:
  - extraction must not add extra retries or duplicate fetch calls.
- State transition integrity:
  - circuit breaker state must remain consistent across requests.
- Dynamic context consistency:
  - runtime config reads stay dynamic via `getAppConfig()` and do not freeze at import time.

## Implementation Steps (Execute in Order)
1. **Extract proxy URL helpers**
   - Add:
     - `apps/lite/src/lib/networking/proxyUrl.ts`
   - Move logic from `fetchUtils.ts`:
     - proxy URL normalization
     - `buildProxyUrl` helper
   - Keep exported behavior identical.

2. **Extract circuit breaker module**
   - Add:
     - `apps/lite/src/lib/networking/circuitBreaker.ts`
   - Move state/policy from `fetchUtils.ts`.
   - Required behavior:
     - same failure threshold
     - same trip duration
     - same test-mode bypass behavior.

3. **Extract timeout/abort helper module**
   - Add:
     - `apps/lite/src/lib/networking/timeouts.ts`
   - Move abort-signal composition/timeout cleanup helpers from `fetchUtils.ts`.

4. **Refactor fetchUtils to orchestrator-only layer**
   - Update:
     - `apps/lite/src/lib/fetchUtils.ts`
   - Required behavior:
     - retain current exports and call signatures.
     - delegate to extracted internal modules.

5. **Extract runtime config defaults/schema internals**
   - Add:
     - `apps/lite/src/lib/runtimeConfig.defaults.ts`
     - `apps/lite/src/lib/runtimeConfig.schema.ts`
   - Update:
     - `apps/lite/src/lib/runtimeConfig.ts`
   - Required behavior:
     - preserve all current env key parsing/validation/fallback behavior.
     - keep `getAppConfig` and `isRuntimeConfigReady` API unchanged.

6. **Docs sync (atomic)**
   - Update architecture/environment docs to reflect modularized internals and unchanged public contracts.

## Acceptance Criteria
- Existing imports of `fetchUtils` and `runtimeConfig` continue to work without code changes.
- Proxy fallback, timeout handling, and circuit-breaker behavior remain unchanged.
- Runtime config validation and defaults behavior remain unchanged.
- Module complexity in `fetchUtils.ts` and `runtimeConfig.ts` is reduced by extraction.
- Circuit-breaker policy parity is maintained (no implicit strategy upgrade during refactor).

## Required Tests
1. Add:
   - `apps/lite/src/lib/networking/__tests__/proxyUrl.test.ts`
   - `apps/lite/src/lib/networking/__tests__/circuitBreaker.test.ts`
   - `apps/lite/src/lib/networking/__tests__/timeouts.test.ts`
2. Keep existing integration tests passing:
   - `apps/lite/src/lib/__tests__/fetchUtils.test.ts`
3. Add:
   - `apps/lite/src/lib/__tests__/runtimeConfig.schema-parity.test.ts`
   - Assert representative env values map to same parsed config as before extraction.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/networking/__tests__/proxyUrl.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/networking/__tests__/circuitBreaker.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/networking/__tests__/timeouts.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/fetchUtils.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/runtimeConfig.schema-parity.test.ts`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/networking/proxyUrl.ts` (new)
  - `apps/lite/src/lib/networking/circuitBreaker.ts` (new)
  - `apps/lite/src/lib/networking/timeouts.ts` (new)
  - `apps/lite/src/lib/runtimeConfig.defaults.ts` (new)
  - `apps/lite/src/lib/runtimeConfig.schema.ts` (new)
  - `apps/lite/src/lib/fetchUtils.ts`
  - `apps/lite/src/lib/runtimeConfig.ts`
  - tests under:
    - `apps/lite/src/lib/networking/__tests__/`
    - `apps/lite/src/lib/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
- Regression risks:
  - subtle timeout/abort cleanup behavior drift
  - circuit-breaker keying behavior mismatch
  - runtime config parse fallback regression
- Required verification:
  - networking module tests pass
  - fetch/runtime integration tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add new networking/config libraries.
- Do not change env variable names.
- Do not change public API signatures in `fetchUtils.ts` / `runtimeConfig.ts`.

## Required Patterns
- Keep entry modules as stable facades.
- Internal module extraction only, behavior-preserving.
- Tests must prove parity for critical paths.

## Decision Log
- Required: Yes.
- Update:
  - `apps/docs/content/docs/general/decision-log.mdx`
  - `apps/docs/content/docs/general/decision-log.zh.mdx`

## Bilingual Sync
- Required: Yes.
- Update both EN and ZH files listed in Impact Checklist.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec vitest run src/lib/networking/__tests__/proxyUrl.test.ts src/lib/networking/__tests__/circuitBreaker.test.ts src/lib/networking/__tests__/timeouts.test.ts src/lib/__tests__/fetchUtils.test.ts src/lib/__tests__/runtimeConfig.schema-parity.test.ts`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
