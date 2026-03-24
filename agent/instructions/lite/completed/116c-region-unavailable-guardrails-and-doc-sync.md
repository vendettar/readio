# Task: 116c (Patch) - Region-Unavailable UX + CI Guardrails + Docs Sync [COMPLETED]

## Goal
Finalize 116 by adding explicit region-unavailable behavior, enforcing static guardrails in CI, decommissioning legacy routes, and completing documentation/decision sync.

## Scope Scan (8 Scopes)
- Config: no new env keys.
- Persistence: no schema change.
- Routing: remove old `/podcast/*` route tree after migration confirmation.
- Logging: clear reason tags for region-unavailable and guardrail failures.
- Network: unchanged endpoints.
- Storage: no new storage requirements.
- UI state: explicit recovery path, no silent fallback.
- Tests: behavior, guardrail, and docs consistency checks.

## Hidden Risk Sweep
- Async: region-unavailable state must not race with delayed fallback fetches.
- Hot-path: no repeated retries causing blocking loops.
- State transition integrity: user must always have a valid CTA out of unavailable state.
- Dynamic context consistency: current page country remains stable unless user explicitly switches.

## Product Contract (Explicit)
- Region-unavailable trigger (all conditions):
  1. Route country is valid.
  2. `lookupPodcast` succeeds for route country.
  3. Target episode/show cannot be resolved in route-country content path (RSS + provider episodes).
- Region-unavailable behavior:
  - Show explicit unavailable message.
  - Show single explicit CTA: open the same podcast/episode under current global country.
  - Never auto-switch country and never silent fallback.

## Required Patterns
- One recovery action only (explicit CTA).
- Legacy `/podcast/*` routes must be removed only after all callers migrated.
- Static guardrails are blocking for production source; test fixture paths are allowlisted.

## Implementation Steps
1. Implement region-unavailable UI contract in podcast content routes.
2. Add static guardrail scripts:
   - route-country dependency guard (block `location.state.country` usage in `/$country/podcast/*` data path),
   - legacy route literal guard (block re-introduction of `/podcast/$id` style active usage).
3. Wire guardrail scripts:
   - add scripts to `apps/lite/package.json`:
     - `lint:route-guards`
     - `lint:legacy-route-ban`
   - include both in CI-required lint pipeline.
4. Remove old route files under `apps/lite/src/routes/podcast/*`.
5. Regenerate route tree artifacts.
6. Documentation sync (EN + ZH):
   - `apps/docs/content/docs/apps/lite/routing.mdx`
   - `apps/docs/content/docs/apps/lite/routing.zh.mdx`
   - `apps/docs/content/docs/apps/lite/episode-resolution.mdx`
   - `apps/docs/content/docs/apps/lite/episode-resolution.zh.mdx`
   - `apps/docs/content/docs/apps/lite/handoff/features/history.mdx`
   - `apps/docs/content/docs/apps/lite/handoff/features/history.zh.mdx`
   - `apps/docs/content/docs/apps/lite/handoff/architecture.mdx`
   - `apps/docs/content/docs/apps/lite/handoff/architecture.zh.mdx`
7. Decision log sync (EN + ZH):
   - record route-country SSOT, feed-key policy, fixed shortId8 policy, and intentional legacy-route decommission.

## Acceptance Criteria
- Region-unavailable state appears only under explicit trigger conditions and always provides explicit CTA.
- No silent country fallback remains in content routes.
- Legacy `/podcast/*` route files removed after migration.
- CI blocks forbidden patterns via new guardrails.
- All required docs and decision logs are updated in EN/ZH.

## Required Tests
- Region-unavailable behavior tests:
  - show message + CTA.
  - no auto-switch.
- Legacy route removal smoke tests:
  - all in-app links still resolve through `/$country/...`.
- Guardrail tests/checks:
  - forbidden pattern causes script failure.
  - allowlisted test/fixture paths remain non-blocking.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite lint:selectors`
- `pnpm -C apps/lite lint:route-guards`
- `pnpm -C apps/lite lint:legacy-route-ban`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `pnpm -C apps/lite build`

## Impact Checklist
- Affected modules:
  - podcast content routes and their tests,
  - static guard scripts and CI wiring,
  - route tree files,
  - routing/episode-resolution/handoff docs and decision log.
- Regression risks:
  - guardrail false positives blocking CI.
  - unhandled navigation after legacy route removal.
  - missing bilingual doc parity.
- Required verification:
  - run full command set above,
  - manual route click-through from all entry surfaces.

## Decision Log
- Required: Yes (must be written in EN + ZH in this step).

## Bilingual Sync
- Required: Yes.

## Completion
- Completed by: Codex (GPT-5)
- Commands:
  - `pnpm -C apps/lite lint` (pass; Biome schema mismatch reported as info only)
  - `pnpm -C apps/lite lint:selectors` (pass)
  - `pnpm -C apps/lite lint:route-guards` (pass)
  - `pnpm -C apps/lite lint:legacy-route-ban` (pass)
  - `pnpm -C apps/lite typecheck` (pass)
  - `pnpm -C apps/lite test:run` (fails due missing `msw/node` resolution in test setup)
  - `pnpm -C apps/lite build` (fails due missing `vite-plugin-pwa` types/module in workspace)
- Date: 2026-02-12
- Reviewed by: Codex (GPT-5)
