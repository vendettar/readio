# Task: 111b - Transcript Tokenization Integration and Performance Guardrails [COMPLETED]

## Precondition (Must)
- `111-multilingual-transcript-tokenization.md` must be completed and review-signed.

## Objective
Integrate locale-aware tokenization into transcript rendering path and validate interaction/performance parity for long transcripts.

## Product Decision (Fixed)
1. Use tokenizer core from `111` as single authority.
2. Pass runtime language from i18n boundary to transcript tokenization path.
3. Keep current interaction semantics (lookup, highlight, selection) unchanged.
4. Add memoization at subtitle-line tokenization boundary to avoid repeated tokenization on unrelated rerenders.

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
  - Keep interaction semantics unchanged; only multilingual correctness and perf stabilization.
- Tests:
  - Add integration tests for transcript word interaction under CJK and mixed text.

## Hidden Risk Sweep (Required)
- Async control flow:
  - No new async flow.
- Hot-path performance:
  - prevent O(n) tokenization repeat on every playback progress tick.
- State transition integrity:
  - lookup popover/menu state transitions must remain unchanged after tokenization switch.
- Dynamic context consistency:
  - language switch updates future tokenization without stale locale.

## Implementation Steps (Execute in Order)
1. **Wire locale into tokenization call sites**
   - Update transcript components/hooks where tokenization is called.
   - Use current i18n language as input.

2. **Add memoization boundary**
   - Memoize per subtitle text + language key.
   - Keep deterministic token order and identity where required by rendering.

3. **Validate interaction parity**
   - Ensure click-to-lookup and repeated-word highlight still work for en/CJK/mixed subtitles.

4. **Docs sync (atomic)**
   - Update transcript interaction docs with locale-aware tokenization wiring notes.

## Acceptance Criteria
- CJK transcript tokens are interactive and lookup works.
- English behavior remains unchanged.
- Mixed-language lines produce stable interaction behavior.
- No visible scrolling/performance regression on long transcripts.

## Required Tests
1. Add:
   - `apps/lite/src/components/Transcript/__tests__/SubtitleLine.i18n-tokenization.test.tsx`
   - Assert click-to-lookup on CJK and mixed tokens.
2. Add:
   - `apps/lite/src/components/Transcript/__tests__/TranscriptView.i18n-tokenization.test.tsx`
   - Assert highlight and menu behavior parity.
3. Optional perf guard test:
   - lightweight assertion that tokenization is memoized for unchanged subtitle+language input.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run -- src/components/Transcript/__tests__/SubtitleLine.i18n-tokenization.test.tsx`
- `pnpm -C apps/lite test:run -- src/components/Transcript/__tests__/TranscriptView.i18n-tokenization.test.tsx`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Decision Log
- Required: No (integration follow-up of approved tokenizer core).

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite lint:selectors`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite exec vitest run src/components/Transcript/__tests__/SubtitleLine.i18n-tokenization.test.tsx src/components/Transcript/__tests__/TranscriptView.i18n-tokenization.test.tsx`
  - `pnpm -C apps/lite test:run`
  - `pnpm --filter @readio/lite build`
- Date: 2026-02-14
- Reviewed by: sirnull
