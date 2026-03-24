# Instruction 126: Provider-Scoped ASR Model Selection Policy [COMPLETED]

## Hard Dependencies
- Instruction 122 (settings/credentials split) must be merged.
- Instruction 123 and 125 (ASR flow and background ASR) must be merged.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Goal
Enforce a strict provider-scoped ASR model contract:
- User must select provider first.
- Model list is derived from that provider only.
- Persisted settings must never keep an invalid provider/model pair.

This instruction also defines model-source policy:
- Runtime model catalog is local allowlist (manual governance), not dynamic provider API enumeration.
- Provider API verification remains key validity check, not model catalog source of truth.

## Product Decisions (Locked)
1. Model list is provider-scoped and statically governed in app code.
2. Provider selection is a hard prerequisite for model selection.
3. If provider changes and current model is not supported, clear model immediately.
4. Verify action requires valid provider + model + key before request.
5. Add advanced fallback input for custom model ID (optional for normal users, enabled intentionally).
6. Custom model mode uses explicit fields:
   - `asrUseCustomModel: boolean`
   - `asrCustomModelId: string`
   and never overloads the normal provider allowlist field.
7. Dynamic model fetch from provider `/models` is out of scope for this instruction.
8. First-release policy applies: no historical data migration/backfill required; enforce runtime normalization fail-closed only.
9. In custom-model mode, runtime model resolution is explicit:
   - `asrUseCustomModel = true` => use `asrCustomModelId` as the effective model id.
   - provider remains required for credential binding and verification request routing.

## Scope
- `apps/lite/src/components/Settings/sections/AsrSettingsSection.tsx`
- `apps/lite/src/hooks/useSettingsForm.ts`
- `apps/lite/src/lib/schemas/settings.ts`
- `apps/lite/src/lib/asr/registry.ts`
- `apps/lite/src/lib/remoteTranscript.ts`
- `apps/lite/src/lib/locales/*.ts`
- `apps/lite/src/components/Settings/__tests__/AsrSettingsSection.test.tsx`
- `apps/lite/src/hooks/__tests__/useSettingsForm.test.ts`
- `apps/lite/src/lib/schemas/__tests__/settings.test.ts`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Scope Scan (8 Scopes)
- Config:
  - Define canonical provider->models mapping in one place (single source of truth).
- Persistence:
  - Stored settings must be normalized to valid provider/model pair on load/save.
- Routing:
  - No route changes.
- Logging:
  - Validation failures should not spam logs.
- Network:
  - No new network endpoints.
- Storage:
  - No DB schema changes.
- UI state:
  - Model control availability depends on provider selection.
- Tests:
  - Add cross-field validation, provider-switch reset, and custom-model fallback tests.

## Hidden Risk Sweep
- Async control flow:
  - Avoid race where stale provider value overwrites model after user switched provider.
- Hot-path performance:
  - Mapping lookup must be O(1) and memoized by provider in component scope.
- State transition integrity:
  - Settings state must not enter "provider/model invalid" without visible validation.
- Dynamic context consistency:
  - Form state and UI options must re-evaluate on provider change; no frozen options from stale initialization.

## Required Patterns
- SSOT for provider/model:
  - Provider registry is source of truth for supported models.
- SSOT for provider/credential binding:
  - Credential lookup must go through a single helper (`provider -> credentialKey`), no UI/runtime hardcoded key branches.
- Cross-field validation:
  - Schema must validate `(provider, model)` pair as a contract, not independent strings only.
  - In custom mode, schema validates `(provider, asrCustomModelId)` contract and does not require allowlist model.
- Fail-closed normalization:
  - Unknown provider/model values are normalized to empty or explicit custom mode.
  - First-release policy: do not add migration/backfill branches; normalize at read/write/runtime boundaries only.
- UI guardrails:
  - Disable model selector until provider is chosen.
  - Auto-clear invalid model when provider changes.
- SSOT boundary:
  - Provider/model catalog constants must live in ASR registry only.
  - UI/schema/runtime must consume registry helpers; no duplicated model-id lists across layers.
- Input canonicalization:
  - `provider`, `model`, `asrCustomModelId` must be trimmed before validation/normalization.
  - empty/whitespace-only values are treated as unconfigured.
  - `asrCustomModelId` is case-preserving (no forced lowercasing).

## Forbidden Dependencies
- No new dependency for forms/state.
- No provider model sync SDK.
- No background polling of provider model catalogs.

## Execution Path

### Phase 1: Canonical Contract
1. Move/define provider-scoped model mapping under ASR registry layer.
2. Expose helper(s) to query models by provider.
3. Keep current Groq model set as explicit allowlist.

### Phase 2: Validation and Normalization
1. Update settings schema with pair-validation:
   - provider required when ASR config is present.
   - model required and must belong to provider list, unless custom mode enabled.
   - if provider/model are incomplete, verify/runtime must be blocked.
   - if custom mode enabled, `asrCustomModelId` is required non-empty trimmed string.
2. Normalize persisted settings:
   - invalid provider -> empty.
   - invalid model for provider -> clear model.
   - if provider changes and existing model is still valid for new provider, preserve it.
   - if custom mode is disabled, clear stale `asrCustomModelId`.
   - no legacy migration path: normalize in current load/save/runtime flow only.

### Phase 3: Settings UI Behavior
1. In ASR settings section:
   - Disable model selector when provider is empty.
   - On provider switch, preserve model when compatible; clear only when incompatible.
   - Show concise validation/helper text.
2. Add advanced custom model input:
   - explicit toggle/action to enter custom model ID.
   - custom value validated as non-empty trimmed string.
   - turning custom mode off restores provider-allowlist selection mode and clears custom-only validation state.

### Phase 4: Runtime Guard
1. Ensure ASR start path (`remoteTranscript`) remains fail-closed when pair invalid.
2. Keep verify endpoint semantics as key-validity check; do not treat it as dynamic catalog source.
3. Standardize runtime error semantics:
   - `unconfigured_provider`
   - `unconfigured_model`
   - `invalid_provider_model_pair`
   These codes must be stable for UI mapping and tests.
4. Verify behavior matrix must be explicit and testable:
   - ASR disabled => verify request blocked (no network call).
   - provider missing => blocked with `unconfigured_provider`.
   - custom mode off + model missing => blocked with `unconfigured_model`.
   - custom mode on + custom model missing => blocked with `unconfigured_model`.
   - provider/model contract invalid => blocked with `invalid_provider_model_pair`.

## Acceptance Criteria
1. Model selector is disabled until provider is selected.
2. Provider switch auto-clears incompatible model.
3. Form cannot save invalid provider/model pair.
4. ASR verify action does not run when provider/model/key contract is invalid.
5. Persisted stale invalid settings are normalized on load (no invalid pair survives).
6. Advanced custom model flow works only when explicitly enabled by user.
7. Docs clearly state model catalog is manual allowlist governance.
8. When ASR is disabled, provider/model/custom fields do not trigger verify/runtime execution.
9. Provider switch preserves existing model if it remains compatible with the new provider.
10. Custom mode uses `asrCustomModelId` as effective runtime model id, while provider remains mandatory.
11. No migration/backfill code path is introduced for legacy settings; normalization is handled in active runtime/form flow.
12. Verify behavior strictly matches the matrix in Phase 4 (including blocked-network behavior).

## Tests (Required)
- Schema:
  - valid provider+model passes.
  - invalid pair fails.
  - custom model path passes only in explicit custom mode.
  - ASR disabled allows empty provider/model/custom fields.
- Settings hook:
  - invalid stored pair gets normalized on load.
  - provider switch keeps model when compatible, clears when incompatible.
  - disabling custom mode clears stale custom-only value.
  - enabling custom mode allows runtime-ready state without allowlist model when custom model id is valid.
  - provider switch + async update order does not restore stale incompatible model.
- Settings UI:
  - model selector disabled when provider empty.
  - provider change clears incompatible model.
  - provider change preserves compatible model.
  - verify is blocked for invalid pair.
  - verify is blocked when ASR disabled.
  - verify matrix cases emit expected blocked behavior (no request) and stable error codes.
- Runtime guard:
  - ASR entry rejects execution when normalized settings are invalid.
  - runtime emits standardized error codes (`unconfigured_provider`, `unconfigured_model`, `invalid_provider_model_pair`).
  - custom mode path executes with provider + custom model even when allowlist model is empty.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite build`
- `pnpm -C apps/lite test:run -- src/lib/schemas/__tests__/settings.test.ts`
- `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/AsrSettingsSection.test.tsx`
- `pnpm -C apps/lite test:run -- src/hooks/__tests__/useSettingsForm.test.ts`
- `pnpm -C apps/lite test:run`

## Impact Checklist
- Affected modules:
  - ASR provider/model contract
  - settings validation/normalization
  - settings UI interaction logic
- Regression risks:
  - existing stored settings become invalid and silently cleared
  - verify button behavior changes from permissive to strict
- Required verification:
  - all commands above pass
  - manual smoke: provider switch and verify flow in Settings page

## Decision Log
- Required: Yes.
- Must append one entry in `apps/docs/content/docs/general/decision-log.mdx`:
  - why provider-scoped static catalog is chosen over runtime `/models`
  - why provider->credential mapping is centralized
  - risk notes for custom-model mode and rollback policy

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite build`
  - `pnpm -C apps/lite test:run -- src/lib/schemas/__tests__/settings.test.ts`
  - `pnpm -C apps/lite test:run -- src/components/Settings/__tests__/AsrSettingsSection.test.tsx`
  - `pnpm -C apps/lite test:run -- src/hooks/__tests__/useSettingsForm.test.ts`
  - `pnpm -C apps/lite test:run`
- Date: 2026-03-02
