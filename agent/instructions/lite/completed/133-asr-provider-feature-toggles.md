# Instruction 133: ASR Provider Feature Toggles (Enable/Disable)

## Hard Dependencies
- Instruction 126 (provider-scoped model policy) must be merged.
- Instruction 132 (Deepgram native provider) must be merged.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `apps/lite/src/lib/runtimeConfig.schema.ts`
- `apps/lite/src/lib/asr/types.ts`
- `apps/lite/src/lib/asr/registry.ts`
- `apps/lite/src/lib/schemas/settings.ts`
- `apps/lite/src/lib/asr/index.ts`

## Goal
Provide deployment-time ASR provider feature toggles so operators can enable/disable providers via runtime env without code forks, while keeping UI visibility, settings normalization, and runtime transcription paths semantically consistent and fail-closed.

## Reopen Reason
- Reopened on 2026-03-07.
- Previous implementation shipped env parsing + UI filtering, but did not complete runtime fail-closed guards in `asr/index.ts` and did not close all required test coverage for toggle behavior.
- This instruction is active again until runtime guard + tests are fully verified.

## Current Gap Snapshot (2026-03-07)
Already landed:
- Runtime env keys exist: `READIO_ENABLED_ASR_PROVIDERS`, `READIO_DISABLED_ASR_PROVIDERS`.
- Runtime schema has unknown-provider validation for both keys.
- Settings UI provider dropdown already depends on enabled-provider filtering.
- Settings normalization already clears stale disabled provider selections.

Not yet landed (blocking completion):
- No shared pure resolver module (`apps/lite/src/lib/asr/providerToggles.ts` absent).
- `asr/index.ts` runtime entry points still do not fail-closed block disabled providers.
- Required toggle test matrix is incomplete (runtime/settings/asr guard coverage gaps).
- Audio-engine docs drift: provider list and toggle semantics are not fully synchronized.

## Product Decisions (Locked)
1. Provider toggles are runtime env driven (`window.__READIO_ENV__`) and support whitelist + blacklist.
2. Blacklist always has higher priority than whitelist.
3. Unknown provider IDs in toggle env values must fail validation clearly (no silent ignore).
4. Disabled providers must be hidden in UI and invalidated in settings snapshots.
5. Disabled providers must be blocked at ASR runtime entry points (transcribe/verify) via fail-closed guard.
6. No DB schema changes, no migration/backfill.

## Scope
- `apps/lite/public/env.js`
- `apps/lite/public/env.local.js.example`
- `apps/lite/src/lib/runtimeConfig.ts`
- `apps/lite/src/lib/runtimeConfig.schema.ts`
- `apps/lite/src/lib/asr/providerToggles.ts` (new; pure toggle resolver)
- `apps/lite/src/lib/schemas/settings.ts`
- `apps/lite/src/components/Settings/sections/AsrSettingsSection.tsx`
- `apps/lite/src/lib/asr/index.ts`
- `apps/lite/src/lib/__tests__/runtimeConfig.schema-parity.test.ts`
- `apps/lite/src/lib/schemas/__tests__/settings.test.ts`
- `apps/lite/src/lib/asr/__tests__/*.test.ts` (provider-toggle guard coverage)
- docs:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Scope Scan Report (8 Required Scopes)
- Config: Medium risk. Toggle parser behavior can drift between schema/settings/runtime if not centralized.
- Persistence: Low risk. No schema migration; only stale-value normalization on read/write boundaries.
- Routing: Low risk. No route changes.
- Logging: Medium risk. Guard failures should be explicit but must avoid leaking secrets.
- Network: Medium risk. Disabled provider must be blocked before any outbound verify/transcribe call.
- Storage: Low risk. No IndexedDB schema/data migration.
- UI state: Medium risk. Hidden provider + stale form values must fail-closed to unconfigured state.
- Tests: High risk if omitted. Must cover resolver semantics and runtime guard behavior.

## Implementation Contract

### 1) Runtime Env Toggles
Add two env keys:
- `READIO_ENABLED_ASR_PROVIDERS`
- `READIO_DISABLED_ASR_PROVIDERS`

Semantics:
- Parse with `trim().toLowerCase()`.
- `enabled`: `'' | '*' | 'all'` means all providers.
- `disabled`: comma-separated IDs to remove after whitelist.
- Deduplicate values.

### 2) Strict Validation
In `runtimeConfig.schema.ts`:
- Validate both lists against immutable `ASR_PROVIDER_IDS`.
- Unknown tokens produce explicit Zod custom issues.
- Validation must normalize token case + whitespace before checking unknown IDs.
- Keep defaults as empty strings for backward compatibility.

### 3) Single Source of Truth for Enabled Providers (Pure Resolver)
Create `apps/lite/src/lib/asr/providerToggles.ts`:
- Expose pure helpers that do not depend on UI/schema/storage layers.
- Required exported API:
  - `resolveEnabledAsrProviders(configLike): ASRProvider[]`
  - `isAsrProviderEnabled(provider, configLike): boolean`
- Semantics:
  - enabled base from `READIO_ENABLED_ASR_PROVIDERS` (`'' | '*' | 'all'` => all)
  - apply disabled subtraction from `READIO_DISABLED_ASR_PROVIDERS`
  - blacklist precedence is fixed
  - output order follows `ASR_PROVIDER_IDS`
  - parsing uses trim + lowercase + dedup.

Then:
- `schemas/settings.ts` `getEnabledAsrProviders()` must delegate to this resolver.
- `AsrSettingsSection.tsx` stays driven by `getEnabledAsrProviders()`.
- `asr/index.ts` runtime guards must use the same resolver API (no duplicate parser).

### 4) Settings Normalization Fail-Closed
In `normalizeAsrPreferenceValues`:
- If stored provider is now disabled, clear:
  - `asrProvider`
  - `asrModel`
  - `asrUseCustomModel`
  - `asrCustomModelId`

### 5) UI Visibility
In `AsrSettingsSection.tsx`:
- Provider dropdown options must come from `getEnabledAsrProviders()` only.
- Provider-specific docs/model rendering must use effective enabled set.

### 6) Runtime Guard (Critical)
In `asr/index.ts`:
- Before `transcribeAudioWithRetry` routes to provider transport:
  - assert provider is enabled via `isAsrProviderEnabled(...)` from resolver module.
  - if disabled, throw `ASRClientError('ASR provider disabled by runtime config', 'client_error')`.
- Before `verifyAsrKey` routes:
  - apply same guard.
- Guard must execute before any chunk planning or network call.

This closes the gap between “UI/Settings hidden” and actual runtime execution.

## Hidden Risk Sweep
- Async control flow:
  - Config toggles can change between reloads; runtime guard prevents stale setting execution.
- State transition integrity:
  - Stale provider from localStorage must normalize to unconfigured state.
- Dynamic context consistency:
  - Enabled-provider list must be derived from current runtime config on each config snapshot path.
- Hot path:
  - Guard checks must be O(1)/small O(n) with tiny provider set; no extra network/db calls.

## Acceptance Criteria
1. Invalid provider IDs in env toggles fail schema validation with explicit message.
2. UI provider list reflects effective enabled set.
3. Settings snapshot clears disabled provider selections.
4. `transcribeAudioWithRetry` fails closed when called with disabled provider.
5. `verifyAsrKey` fails closed when called with disabled provider.
6. Blacklist precedence over whitelist is deterministic.
7. Toggle resolution logic is centralized in a pure resolver used by both settings and runtime ASR guards.
8. Docs describe all supported providers and toggle semantics accurately.
9. Effective provider list and docs reflect current registry (`groq`, `qwen`, `deepgram`).

## Tests (Required)
- `settings.test.ts`
  - whitelist-only mode
  - blacklist subtraction precedence
  - stale provider normalization
  - whitespace/case normalization
- `asr` tests
  - transcribe guard rejects disabled provider
  - verify guard rejects disabled provider
  - enabled provider path remains unchanged
- `runtimeConfig` tests
  - unknown IDs in enabled/disabled produce schema issues
- `providerToggles` tests (new)
  - blacklist precedence over whitelist
  - `all/*/empty` semantics
  - dedup + whitespace + case normalization

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/runtimeConfig.schema-parity.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/providerToggles.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/schemas/__tests__/settings.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/index*.test.ts`

## Impact Checklist
- Affected modules:
  - runtime config parser/schema
  - asr toggle resolver (shared runtime/settings)
  - settings normalization/snapshot
  - ASR runtime routing guards
  - settings UI provider select
- Regression risks:
  - false rejection of enabled providers
  - stale config semantics with whitespace/case
  - settings/runtime resolver divergence (must be eliminated by shared helper)
  - docs drift vs actual provider list
- Required verification:
  - commands above pass
  - manual smoke: toggle provider off in env, reload, verify provider hidden and runtime blocked

## Required Patterns / Forbidden Dependencies
- Required patterns:
  - resolver-first architecture (`providerToggles.ts` as SSOT)
  - fail-closed runtime guards at ASR entry points
  - deterministic token normalization (trim + lowercase + dedup)
- Forbidden dependencies:
  - no provider-toggle parsing logic duplicated in UI/components
  - no direct env-string parsing in `asr/index.ts` or component layer
  - no DB migration/backfill or schema mutations for this instruction

## Decision Log
- Required: Yes.
- Record in `apps/docs/content/docs/general/decision-log.mdx`:
  - why runtime fail-closed guard is mandatory (not UI-only)
  - why blacklist precedence is fixed

## Bilingual Sync
- Required: Yes.
- Update both:
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
  - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`

## Completion
- Status: Reopened (pending execution + review sign-off)
- Reopened by: Codex (GPT-5)
- Reopen date: 2026-03-07
- Reopen reason:
  - runtime fail-closed guard not fully landed in `asr/index.ts`
  - required toggle test matrix not fully closed
