# Task: 115b - Background Download/Fetch Exploration (Experimental)

## Precondition (Must)
- `115-advanced-media-service-worker.md` must be completed and review-signed.

## Objective
Evaluate background download mechanisms for supported browsers as an optional enhancement, without making it a required production path.

## Product Decision (Fixed)
1. This is an experimental follow-up only.
2. Must be capability-detected and optional.
3. Must not break baseline playback/offline behavior when unsupported.

## Implementation Steps (Execute in Order)
1. Capability matrix and browser support doc.
2. Prototype optional background download path.
3. Add fallback-to-baseline behavior tests.
4. Gate rollout behind explicit feature flag.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `pnpm --filter @readio/lite build`

## Decision Log
- Required: Yes.

## Bilingual Sync
- Required: Yes.
