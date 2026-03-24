---
description: Prevent secret-bearing runtime config from being exposed to browser clients
---

# Instruction 137a: Runtime Config Secret Guard [COMPLETED]

Goal: Harden Lite runtime config so browser-exposed env values cannot silently act as upstream provider secrets, while preserving the documented self-host/public-token deployment model.

## Scope
- `apps/lite/public/env.js`
- `apps/lite/src/lib/runtimeConfig.ts`
- `apps/lite/src/lib/runtimeConfig.schema.ts`
- Relevant tests/docs that directly cover runtime config behavior

## Read First (Required)
- `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Scope Scan (Required Before Coding)
Check and report risks across:
1. Config & env parsing
2. Persistence & data integrity
3. Routing & param validation
4. Logging & error handling
5. Network & caching
6. Storage & serialization
7. UI state & hooks
8. Tests & mocks

Also perform a hidden-risk sweep for:
- async control flow around config hydration
- hot-path overhead from repeated validation/logging

## Required Changes
1. Make the browser runtime-config contract explicit and fail-closed for secret-like values intended for upstream providers.
2. Add a guard that rejects or neutralizes obviously secret-bearing provider credentials in client runtime config.
3. Preserve safe public/self-host deployment values where they are intentionally browser-visible.
4. Add regression coverage for the guarded behavior.
5. Update the correct handoff sub-docs with exact key names and deployment constraints.

## Forbidden Dependencies / Required Patterns
- Forbidden: server-only secret assumptions in the Vite client
- Forbidden: silent fallback that continues using secret-like values after warning
- Required: exact env key names must match code
- Required: docs must clearly distinguish browser-safe tokens from provider secrets

## Acceptance Criteria
- Real provider secrets supplied through browser runtime config are rejected or ignored by design.
- Browser-safe/public tokens still work when explicitly allowed by the contract.
- Runtime config behavior remains deterministic when env hydration is unavailable or malformed.

## Required Tests
- Add/update a runtime-config regression test for secret-like provider key input.
- Cover the fail-closed fallback path.

## Verification Commands
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite typecheck`

## Decision Log
- Waived

## Bilingual Sync
- Required

## Completion
- Completed by: Worker (Codex)
- Commands:
  - `pnpm -C apps/lite exec vitest run src/lib/__tests__/runtimeConfig.schema-parity.test.ts src/lib/db/__tests__/credentialsRepository.test.ts`
  - `pnpm -C apps/lite exec vitest run src/lib/__tests__/remoteTranscript.asr.test.ts src/lib/__tests__/remoteTranscript.retranscribe.test.ts`
  - `pnpm -C apps/lite test:run`
  - `pnpm -C apps/lite typecheck`
- Date: 2026-03-18
- Reviewed by: Codex
