# Instruction 005d: Cloud Frontend Runtime Cutover [COMPLETED]

## Parent
- `005-cloud-networking-cutover.md`

## Objective
Finish the Cloud frontend runtime transition after backend-owned networking paths exist.

This is the step that removes Lite-only browser-direct networking assumptions from Cloud.

## Goal
After this instruction:

- Cloud frontend runtime config no longer requires Lite browser-direct networking settings for migrated flows
- Cloud Settings removes the `CORS Proxy` block
- Cloud frontend defaults and runtime docs reflect backend-owned networking

## Required Work
In `apps/cloud-ui`:

- switch runtime config defaults for migrated discovery/search/feed flows to same-origin backend endpoints
- remove Cloud dependency on `READIO_CORS_PROXY_*` for the migrated Cloud experience
- remove the `CORS Proxy` settings block from Cloud Settings
- keep the rest of Settings visually and behaviorally aligned with Lite

Do not:

- redesign Settings
- add Cloud marketing copy in place of the removed block
- remove unrelated Lite-equivalent settings behavior

## Tests
At minimum:

- tests proving Cloud Settings no longer renders the `CORS Proxy` block
- tests proving migrated Cloud flows no longer depend on browser-direct config
- route/UI parity tests for Settings if available

## Verification
1. `pnpm -C apps/cloud-ui build`
2. `pnpm -C apps/cloud-ui test:run -- --runInBand`
3. targeted import/config searches showing Cloud no longer depends on Lite CORS proxy settings for migrated paths

## Done When
- Cloud Settings removes `CORS Proxy`
- migrated Cloud networking no longer depends on browser-direct proxy config
- the rest of Cloud Settings stays Lite-equivalent

## Completion
- Completed by: Turing
- Reviewed by: Peirce
- Commands:
  - `pnpm -C apps/cloud-ui build`
  - `pnpm -C apps/cloud-ui test:run -- --runInBand`
  - `rg -n "READIO_DISCOVERY_SEARCH_URL|READIO_DISCOVERY_LOOKUP_URL|READIO_RSS_FEED_BASE_URL|DISCOVERY_SEARCH_URL|DISCOVERY_LOOKUP_URL|RSS_FEED_BASE_URL|itunes\.apple\.com|rss\.applemarketingtools\.com|/api/v1/discovery" apps/cloud-ui/public/env.js apps/cloud-ui/src/lib/runtimeConfig.defaults.ts apps/cloud-ui/src/lib/__tests__/cloudRuntimeDefaultsContract.test.ts`
- Date: 2026-03-27
