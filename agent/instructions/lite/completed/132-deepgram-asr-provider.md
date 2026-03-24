# Instruction 132: Add Deepgram Native ASR Provider [COMPLETED]

## Hard Dependencies
- Instruction 126 (provider-scoped model policy) is merged.
- Instruction 131 (Groq refinement) is merged.

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/asr-provider/deepgram.mdx`

## Goal
Introduce Deepgram as a first-class ASR provider through a native transport (not OpenAI-compatible), while preserving current ASR contracts, retry semantics, and settings validation behavior.

## Product Decisions (Locked)
1. Deepgram must use its own module: `deepgramCompatible.ts`.
2. Transcription request must be raw binary upload (`Blob`) with `Authorization: Token <key>`.
3. Model governance remains allowlist-based in registry.
4. First-release policy: no migration/backfill for legacy settings payloads.
5. Missing word timestamps must not fail transcription when transcript text exists; use transcript-only fallback cue.
6. Add Deepgram without changing Groq/Qwen behavior.

## Scope
- `apps/lite/src/lib/asr/providers/deepgramCompatible.ts` (new)
- `apps/lite/src/lib/asr/index.ts`
- `apps/lite/src/lib/asr/registry.ts`
- `apps/lite/src/lib/asr/types.ts`
- `apps/lite/src/lib/schemas/settings.ts`
- `apps/lite/src/components/Settings/sections/AsrSettingsSection.tsx`
- `apps/lite/src/lib/asr/__tests__/deepgramCompatible.test.ts` (new)
- `apps/lite/src/lib/asr/__tests__/index.deepgram-routing.test.ts` (new)
- `apps/lite/src/lib/schemas/__tests__/settings.test.ts`
- `apps/docs/content/docs/apps/lite/handoff/features/asr-provider/deepgram.mdx`

## Scope Scan (8 Scopes)
- Config:
  - Add `deepgram` provider id, native transport id, provider model allowlist, and verify endpoint config.
- Persistence:
  - Settings normalization must accept/store Deepgram provider+model pair.
- Routing:
  - `transcribeAudioWithRetry` and `verifyAsrKey` must route by transport to Deepgram path.
- Logging:
  - Keep existing `ASRClientError` taxonomy; do not log full Deepgram payload/transcript.
- Network:
  - Raw binary `POST` to Deepgram listen endpoint with `Token` auth.
- Storage:
  - No DB schema changes.
- UI state:
  - Provider/model options remain registry-driven; switching provider must refresh model options deterministically.
- Tests:
  - Add provider contract tests, routing tests, and settings validation tests.

## Hidden Risk Sweep
- Async control flow:
  - Abort during request/upload must map to `ASRClientError(code='aborted')`.
  - Non-retryable 4xx must not enter retry loops (except existing 429 policy).
- Hot-path performance:
  - Never base64-wrap full audio for Deepgram path; keep Blob upload to avoid memory inflation.
- State transition integrity:
  - Verify flow must fail closed for invalid key/provider/model combinations.
- Dynamic context consistency:
  - Provider/model selector must not retain stale model when provider changes.

## Required Patterns
- Single transport boundary:
  - All Deepgram HTTP/parsing logic stays in `deepgramCompatible.ts`.
- Error model SSOT:
  - Reuse existing `ASRClientError` codes (`unauthorized`, `rate_limited`, `service_unavailable`, `payload_too_large`, etc.).
- Fail-closed parsing:
  - Use strict unknown guards for nested Deepgram payload shape.
  - Return success only when at least one usable cue can be derived.
- Registry SSOT:
  - UI/schema must consume provider ids and models from registry helpers only.

## Forbidden Dependencies
- No Deepgram SDK.
- No new HTTP/state libraries.
- No OpenAI-compatible multipart fallback for Deepgram.

## Implementation Details

### 1) Add native Deepgram provider module
Create `apps/lite/src/lib/asr/providers/deepgramCompatible.ts` with:
- `transcribeWithDeepgram(options): Promise<ASRTranscriptionResult>`
- `verifyDeepgramKey(options): Promise<boolean>`

Transcription request contract:
- Endpoint: `POST https://api.deepgram.com/v1/listen`
- Headers:
  - `Authorization: Token <API_KEY>`
  - `Content-Type: <blob.type>`; fallback `audio/mpeg` when empty
- Body: raw `Blob` (not `FormData`)
- Query params (fixed baseline):
  - `model=<modelId>`
  - `smart_format=true`
  - `punctuate=true`
  - `diarize=false`

Response parsing contract:
- Read transcript from `results.channels[0].alternatives[0].transcript`.
- Read words from `results.channels[0].alternatives[0].words[]`.
- Build cues with this priority:
  1. Valid words exist: one cue covering `[firstWord.start, lastWord.end]`, attach `words`.
  2. No valid words but transcript text exists: transcript-only fallback cue.
  3. Neither usable words nor transcript text: throw `ASRClientError(code='service_unavailable')`.
- `durationSeconds`:
  - Use `lastWord.end` when valid words exist.
  - Otherwise `undefined`.
  - Do not derive duration from synthetic transcript-only fallback cue.

Error handling:
- Map status to existing taxonomy:
  - `401 -> unauthorized`
  - `413 -> payload_too_large`
  - `429 -> rate_limited` (with retry-after parsing)
  - `>=500 -> service_unavailable` (with retry-after parsing)
  - other non-2xx -> `client_error`
- Network/abort mapping must match current provider behavior.

Key verification contract:
- Verify endpoint: `GET https://api.deepgram.com/v1/projects`
- Headers: `Authorization: Token <API_KEY>`
- Return:
  - `200 => true`
  - `401 => false`
  - other non-2xx => throw mapped `ASRClientError`

### 2) Registry + provider typing updates
- Extend `ASR_PROVIDER_IDS` and `ASRProvider` in `types.ts` with `deepgram`.
- Extend `ASRTransport` in `registry.ts` with `deepgram-native`.
- Add Deepgram config entry:
  - `id: 'deepgram'`
  - `label: 'Deepgram'`
  - `transport: 'deepgram-native'`
  - `transcribeEndpoint: 'https://api.deepgram.com/v1/listen'`
  - `verifyEndpoint: 'https://api.deepgram.com/v1/projects'`
  - `responseFormat`: type-safe placeholder per existing registry contract
- Add model allowlist:
  - `['nova-3', 'nova-2', 'nova', 'base', 'whisper']`

### 3) Core ASR routing integration (`index.ts`)
- In transcription path, route by `providerConfig.transport`:
  - `openai-compatible` -> existing path
  - `qwen-chat-completions` -> existing path
  - `deepgram-native` -> `transcribeWithDeepgram`
- In `verifyAsrKey`, add Deepgram branch -> `verifyDeepgramKey`.
- Keep shared retry/execution policy unchanged outside provider function boundaries.

### 4) Settings + validation coverage
- Ensure schema normalization accepts Deepgram provider + allowlisted model.
- Ensure invalid provider/model pair fails closed.
- No migration code; runtime normalization only.

### 5) Documentation sync
- Update `deepgram.mdx` to match implementation truth:
  - Readio uses binary upload path (not URL JSON path).
  - Exact query params and defaults.
  - Word-missing fallback semantics.
  - Verify endpoint semantics used in app.

## Acceptance Criteria
1. Deepgram is selectable in provider dropdown and model list is provider-scoped.
2. Deepgram transcription uses raw binary upload with `Token` auth only.
3. Deepgram response is parsed into `ASRCue[]`; word timestamps are attached when available.
4. Missing words + transcript present returns transcript-only cue and does not throw.
5. Empty transcript and invalid/missing words fails closed with mapped error.
6. Key verification follows `200/401/other non-2xx` contract.
7. Groq/Qwen behavior remains unchanged.
8. Tests and docs are updated atomically.

## Tests (Required)
- `deepgramCompatible.test.ts`:
  - request contract: URL/query/header/body (raw Blob, not FormData)
  - parsing contract: words -> cues -> duration
  - missing words with transcript fallback
  - empty transcript + no valid words fails closed
  - 401/413/429/5xx mapping + retry-after extraction
  - abort mapping (`code='aborted'`)
  - verify endpoint contract (`200 true`, `401 false`, other non-2xx throws)
- `index.deepgram-routing.test.ts`:
  - transport routing calls `transcribeWithDeepgram` only for Deepgram provider
  - verify routing calls `verifyDeepgramKey` for Deepgram provider
  - non-Deepgram providers do not hit Deepgram transport
- `settings.test.ts`:
  - Deepgram provider/model valid pair passes
  - invalid Deepgram model fails
  - provider switch model normalization remains deterministic

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/deepgramCompatible.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/index.deepgram-routing.test.ts`
- `pnpm -C apps/lite test:run -- src/lib/schemas/__tests__/settings.test.ts`

## Impact Checklist
- Affected modules:
  - ASR provider transport layer
  - ASR registry/type contracts
  - settings provider/model validation path
- Regression risks:
  - transport branch mismatch
  - malformed Deepgram payload producing false-success empty results
  - settings validation drift
- Required verification:
  - all commands above pass
  - manual smoke: settings verify + one Deepgram transcription run

## Decision Log
- Required: Yes.
- Append one entry to:
  - `apps/docs/content/docs/general/decision-log.mdx`
- Must capture:
  - why Deepgram uses native transport instead of OpenAI-compatible wrapper
  - risk notes for binary upload + fail-closed parsing fallback

## Bilingual Sync
- Not applicable (`deepgram.mdx` currently has no `.zh.mdx` counterpart).

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/deepgramCompatible.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/index.deepgram-routing.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/schemas/__tests__/settings.test.ts`
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/deepgramCompatible.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/asr/__tests__/index.deepgram-routing.test.ts`
  - `pnpm -C apps/lite test:run -- src/lib/schemas/__tests__/settings.test.ts`
- Date: 2026-03-04
