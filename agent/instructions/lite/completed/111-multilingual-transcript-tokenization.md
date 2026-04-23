# Task: 111 - Multilingual Transcript Tokenization Core (Phase 1) [COMPLETED]

## Objective
Introduce locale-aware tokenization core for transcripts using `Intl.Segmenter` with deterministic fallback, without changing transcript UI interaction behavior in this phase.

## Product Decision (Fixed)
1. Phase 1 scope is tokenizer core only.
2. Use `Intl.Segmenter` (`granularity: 'word'`) when available.
3. Keep regex tokenizer as deterministic fallback.
4. Preserve delimiter tokens (punctuation/whitespace) for rendering parity.
5. Keep current `Word`/`SubtitleLine` interaction wiring unchanged in this phase.
6. Defer component integration and performance tuning to `111b`.

## Scope Scan (Required)
- Config:
  - No runtime config changes.
- Persistence:
  - No schema/storage changes.
- Routing:
  - No route changes.
- Logging:
  - No new logging behavior.
- Network:
  - No network changes.
- Storage:
  - No localStorage/IndexedDB changes.
- UI state:
  - No transcript UI behavior changes in this phase.
- Tests:
  - Add tokenizer unit tests with multilingual fixtures.

## Hidden Risk Sweep (Required)
- Async control flow:
  - No async flow introduced.
- Hot-path performance:
  - tokenizer function must be allocation-conscious and cache segmenter instances by locale.
- State transition integrity:
  - token shape must remain compatible with existing rendering path.
- Dynamic context consistency:
  - locale resolution must handle `en-US` style input and normalize to base where needed.

## Implementation Steps (Execute in Order)
1. **Extract tokenizer core module**
   - Add:
     - `apps/lite/src/lib/text/tokenizeWithLocale.ts`
   - Required exports:
     - `tokenizeWithLocale(text: string, language: string)`
     - `tokenizeFallback(text: string)`
   - Required behavior:
     - preserve existing token contract consumed by transcript components.
     - include delimiter tokens in output.

2. **Add segmenter cache utility**
   - In tokenizer module, keep in-memory per-locale `Intl.Segmenter` cache.
   - Normalize locale input before cache lookup.

3. **Bridge from existing tokenizer entry**
   - Update:
     - `apps/lite/src/lib/text.ts`
   - Required behavior:
     - keep existing public tokenizer API stable.
     - delegate internals to new locale-aware tokenizer.

4. **No UI wiring changes in Phase 1**
   - Do not modify `Word.tsx`, `SubtitleLine.tsx`, `TranscriptView.tsx` in this instruction.

5. **Docs sync (atomic)**
   - Update transcript/i18n docs to record tokenizer-core capability and phase split.

## Acceptance Criteria
- Locale-aware tokenizer exists and passes multilingual unit tests.
- Fallback tokenizer behavior remains deterministic.
- No UI behavior changes are introduced in this phase.
- Existing transcript-related tests stay green.

## Required Tests
1. Add:
   - `apps/lite/src/lib/text/__tests__/tokenizeWithLocale.test.ts`
   - Cover:
     - English spacing/punctuation
     - Chinese sentence segmentation
     - Japanese segmentation
     - Korean segmentation
     - mixed-language sentence
     - fallback path when `Intl.Segmenter` is unavailable
2. Keep existing transcript tests passing.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/lib/text/__tests__/tokenizeWithLocale.test.ts`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Impact Checklist
- Affected modules:
  - `apps/lite/src/lib/text/tokenizeWithLocale.ts` (new)
  - `apps/lite/src/lib/text.ts`
  - tests under `apps/lite/src/lib/text/__tests__/`
  - docs:
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/i18n.mdx`
    - `apps/docs/content/docs/apps/lite/handoff/i18n.zh.mdx`
- Regression risks:
  - token boundary drift affecting click targets
  - delimiter preservation regressions
- Required verification:
  - tokenizer tests pass
  - full lite suite and build pass

## Forbidden Dependencies
- Do not add third-party tokenizer libraries.
- Do not change transcript UI behavior in this phase.

## Required Patterns
- Feature-detect `Intl.Segmenter` at runtime.
- Preserve existing token schema contract.
- Keep fallback deterministic.

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
  - `pnpm -C apps/lite exec vitest run src/lib/text/__tests__/tokenizeWithLocale.test.ts`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
