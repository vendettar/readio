# Instruction 126: Provider-Scoped ASR Model Selection Policy [COMPLETED]
# [SUPERSPECED / UPDATED 2026-04-02] - Custom Model Support REMOVED

## Hard Dependencies
- Instruction 122 (settings/credentials split) must be merged.
- Instruction 123 and 125 (ASR flow and background ASR) must be merged.

## Goal
Enforce a strict provider-scoped ASR model contract:
- User must select provider first.
- Model list is derived from that provider only.
- Persisted settings must never keep an invalid provider/model pair.

## Product Decisions (Locked & Updated)
1. Model list is provider-scoped and statically governed in app code.
2. Provider selection is a hard prerequisite for model selection.
3. If provider changes and current model is not supported, clear model immediately.
4. Verify action requires valid provider + model + key before request.
5. **[REMOVED]** Advanced fallback input for custom model ID is DELETED and no longer supported.
6. **[REMOVED]** `asrUseCustomModel` and `asrCustomModelId` have been purged from schemas, types, and UI.
7. **Groq-Only Rollout Phase**: Currently, the system only enables 'groq' as a valid provider at the normalization level. ALL other providers are fail-closed.
8. Runtime model resolution is strictly bound to the local provider registry allowlist.

## Scope
- `apps/lite/src/components/Settings/sections/AsrSettingsSection.tsx`
- `apps/lite/src/hooks/useSettingsForm.ts`
- `apps/lite/src/lib/schemas/settings.ts`
- `apps/lite/src/lib/asr/registry.ts`
- `apps/lite/src/lib/remoteTranscript.ts`
- `apps/lite/src/lib/locales/*.ts`
- `apps/lite/src/lib/schemas/__tests__/settings.test.ts`

## Scope Scan
- Config: Define canonical provider->models mapping in registry.
- Persistence: Stored settings normalized to valid provider/model pair on load/save.
- UI state: Model control availability depends on provider selection.
- Tests: Coverage for normalization (resetting invalid/disabled providers) and provider-switch integrity.

## Required Patterns
- SSOT for provider/model: Provider registry is source of truth for supported models.
- Fail-closed normalization:
  - Unknown/Disabled provider values are normalized to empty strings.
  - Normalization occurs at read/write/runtime boundaries.
- UI guardrails: Disable model selector until provider is chosen; Auto-clear invalid model on provider change.

## Acceptance Criteria
1. Model selector is disabled until provider is selected.
2. Provider switch auto-clears incompatible model.
3. Form cannot save invalid/disabled provider/model pair.
4. Persisted stale invalid settings (e.g. legacy providers) are normalized to empty on load.
5. Runtime guard rejects execution when normalized settings are invalid.

## Completion
- **Completed by**: Execution Agent
- **Last Updated**: 2026-04-02
- **Current Status**: Custom model logic completely removed; Groq-only strict enrollment enforced.
