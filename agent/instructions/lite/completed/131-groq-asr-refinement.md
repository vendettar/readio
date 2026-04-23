# Instruction 131: Groq ASR Refinement (Granularity & Diagnostics) [COMPLETED]

## Goal
Improve the `openaiCompatible` ASR provider implementation by leveraging the realistic Groq API response structure. **Important: These refinements (especially parameter overrides and proprietary metadata) are specific to the Groq provider only.** The improvements will explicitly request word-level granularity for Groq, enhance diagnostic tracing using Groq's request IDs, and bullet-proof the duration parsing.

## Scope
- `apps/lite/src/lib/asr/providers/openaiCompatible.ts`
- `apps/lite/src/lib/__tests__/asr/asrProviderGroq.test.ts`

## Impact Checklist
- **Affected modules**
  - `apps/lite/src/lib/asr/providers/openaiCompatible.ts`
  - `apps/lite/src/lib/__tests__/asr/asrProviderGroq.test.ts`
  - `apps/docs/content/docs/apps/lite/handoff/features/asr-provider/groq.mdx`
- **Regression risks**
  - Non-Groq OpenAI-compatible providers must not receive `timestamp_granularities[]`.
  - Duration fallback must not be polluted by synthetic text-only cue defaults.
  - Debug logging must not leak transcript text or payload body.
- **Required verification**
  - Provider-specific FormData contract assertions.
  - Duration fallback chain assertions.
  - Logging assertions scoped to Groq metadata only.

## Implementation Details

### 1. Explicit Timestamp Granularities
While `response_format='verbose_json'` is currently sent, the OpenAI specification (which Groq adheres to) often omits the `words` array unless explicitly requested.
- In `transcribeWithOpenAiCompatible`, **only when `providerConfig.id === 'groq'`**, append the following to the `FormData`:
  - `timestamp_granularities[]` set to `segment`
  - `timestamp_granularities[]` set to `word`
- *Note: Other OpenAI-compatible providers might not support the `timestamp_granularities` array parameter and could return HTTP 400 errors if it is included.*
- This ensures we receive the high-resolution word-level timestamps (`words` array inside `segments`) required for precise subtitle following on Groq.
- Add an explicit guardrail: **never** append `timestamp_granularities[]` for non-Groq providers even if they share `openaiCompatible` transport.

### 2. Diagnostic Log Tracing (`x_groq.id`)
The raw JSON returned from Groq includes specific trace metadata (e.g., `"x_groq": { "id": "req_01kjwb7xdze1xvxfz3trt5r2zs" }`).
- Extract this `id` from the payload in `transcribeWithOpenAiCompatible`.
- Add a discrete debug/log using the application logger (e.g., `debug('[ASR] Groq Request ID', { requestId: payload.x_groq?.id, provider: providerConfig.id, model })`) to help debug requests.
- Log level must stay `debug`, and logs must not include transcript text or other payload content.
- Emit this log only when `providerConfig.id === 'groq'` and `x_groq.id` is a non-empty string.
- Ensure the types for `OpenAiCompatibleVerboseJsonResponse` account for an optional `x_groq` object.

### 3. Bulletproof Duration Fallback
Currently, the returned ASR result duration strictly depends on `payload.duration`.
- Modify `transcribeWithOpenAiCompatible` so the duration cascade is:
  - `payload.duration` (finite number)  
  - `lastCue.end` from **segment-derived cues only**  
  - `undefined`
- Do not use synthetic text-only fallback cues to derive duration.
- Use parsed cues as the fallback source (`lastCue.end`) instead of reparsing raw payload segments again.
- This provides a safer base offset (Base Offset) for chunk-merged subsequent audio slices where the provider fails to provide a top-level `duration` field.

### 4. Error-Tolerant Behavior
- Missing `x_groq` must not fail transcription.
- Missing `words` arrays must not fail transcription; keep current segment/text fallback behavior.
- Refinement must preserve current successful baseline behavior for all non-Groq providers.

### 5. Test Strategy (Contract Tests)
- Add/extend tests in `apps/lite/src/lib/__tests__/asr/asrProviderGroq.test.ts`.
- Required test cases:
  1. Groq appends two `timestamp_granularities[]` values (`segment`, `word`).
  2. Non-Groq provider does not append `timestamp_granularities[]`.
  3. `durationSeconds` fallback chain: `payload.duration` -> `lastCue.end (segment-derived only)` -> `undefined`.
  4. Text-only fallback (`payload.text` without valid `duration`/segments) must keep `durationSeconds === undefined`.
  4. Missing `x_groq` and missing `words` do not throw.
  5. Debug logging includes `x_groq.id` when present and excludes transcript content.
  6. Debug logging does not run for non-Groq providers.

### 6. Docs Sync
- Update Groq provider handoff docs to explicitly state that word-level timestamps depend on request-side `timestamp_granularities[]`, and this is Groq-specific in current implementation.
- Target doc: `apps/docs/content/docs/apps/lite/handoff/features/asr-provider/groq.mdx`

## Acceptance Criteria
1. `formData` explicitly includes `timestamp_granularities[]` **only when the provider is Groq (`providerConfig.id === 'groq'`)**.
2. The `x_groq.id` field is gracefully logged when present in the response, and only for Groq responses.
3. `durationSeconds` correctly cascades checking: `payload.duration` -> `lastCue.end (segment-derived only)` -> `undefined` (this fallback safely applies to all providers).
4. Unit tests reflect the conditionally appended `timestamp_granularities` fields for Groq and the duration fallback logic.
5. Contract tests confirm non-Groq compatibility is not regressed.
6. Documentation and implementation are synchronized in the same change.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/__tests__/asr/asrProviderGroq.test.ts`

## Decision Log
- Required: Waived (provider-level refinement, no architecture decision boundary change).

## Bilingual Sync
- Not applicable (`asr-provider/groq.mdx` currently has no `.zh.mdx` counterpart).

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/asr/asrProviderGroq.test.ts`
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec biome check --write src/lib/asr/providers/openaiCompatible.ts`
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run -- src/lib/__tests__/asr/asrProviderGroq.test.ts`
- Date: 2026-03-04
