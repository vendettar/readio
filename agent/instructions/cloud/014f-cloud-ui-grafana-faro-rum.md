# Instruction 014f — Cloud UI Grafana Faro RUM [COMPLETED]

## Objective

Add optional Grafana Faro browser observability to `apps/cloud-ui` for client crashes, Web Vitals, and sanitized schema-validation diagnostics. Faro must be disabled by default and must not affect app boot when config is absent or collector requests fail.

## Decision Log

- **Required / Waived**: Waived. This follows the master Grafana Cloud decision.

## Bilingual Sync

- **Required / Not applicable**: Required for runtime docs touched by this instruction.

## Scope

Frontend only:

- `apps/cloud-ui/package.json`
- Lockfile if dependency installation changes it
- Runtime config schema/loader files under `apps/cloud-ui/src/lib/`
- Faro implementation files under `apps/cloud-ui/src/lib/`
- App entry/root file only as needed to initialize Faro
- Focused tests

Backend:

- `apps/cloud-api/browser-env-allowlist.json`
- `/env.js` browser allowlist tests, if they exist

Docs:

- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`

If more than 10 files are required, stop and split.

## Preserve Existing Behavior

- Do not change `/ops`, `/admin/*`, admin token handling, routing visibility, playback, downloads, ASR relay, discovery, or runtime config ownership.
- Faro is additive and optional.
- Missing Faro config must not fail app boot.
- Faro initialization failure must not fail app boot.

## Required Config

Browser-public runtime config:

- `VITE_GRAFANA_FARO_URL`
- `VITE_GRAFANA_FARO_APP_NAME`
- `VITE_GRAFANA_FARO_ENV`
- `VITE_GRAFANA_FARO_SAMPLE_RATE`

Rules:

- Only Faro collector URL and non-secret public metadata may be browser-visible.
- No Grafana API key, Loki credential, Prometheus credential, admin token, relay token, provider key, or Basic Auth value may be browser-visible.
- Sample rate must parse to a bounded number from `0` to `1`; invalid values disable Faro or fall back to a conservative default.

## Required Privacy Contract

Only sanitized event data may be sent to Faro.

Allowed schema diagnostic fields:

- schema name
- provider enum
- route class
- issue path
- Zod issue code
- coarse error class

Forbidden:

- raw Zod input
- raw upstream payload
- full URL, query string, fragment
- request/response body
- headers
- admin token
- relay token
- provider API key
- cookies
- local file path
- transcript text
- episode description
- user search text
- audio URL

Add a small sanitizer utility and tests for emails, `/Users/...` paths, `sk-*` style secrets, Bearer tokens, signed URLs, and transcript-like long text.

## Required Implementation

1. Install `@grafana/faro-web-sdk` and `@grafana/faro-react` only if needed for the chosen integration.
2. Create an isolated Faro module with:
   - `initializeFaro(config)`
   - `reportSchemaValidationError(input)`
   - sanitizer helpers
3. Initialize Faro once from the top-level app/root path after runtime config is available.
4. Use sampling before emitting optional diagnostics.
5. Never couple Faro to `/ops` session state or admin token.
6. Do not add in-app explanatory text or navigation.

## Tests

Add focused tests for:

1. Faro does not initialize when `VITE_GRAFANA_FARO_URL` is missing.
2. Invalid sample rate is bounded and safe.
3. Initialization exceptions are swallowed with dev-visible warning only and app boot continues.
4. Sanitizer redacts email, local path, Bearer token, `sk-*` token, signed URL query, cookies, and long transcript-like text.
5. Zod diagnostic reporting sends only allowed fields, not raw payload.
6. `/ops` token/sessionStorage is not read by Faro code.
7. Browser env allowlist includes only public Faro fields and no Grafana write credentials.

## Verification

- `pnpm -C apps/cloud-ui test -- --run`
- `pnpm -C apps/cloud-ui build`

## Documentation

- Document browser-public Faro config in deployment docs and zh counterpart.
- Explicitly document that Faro collector config is public and no Grafana write credential is browser-visible.
- Do not update `technical-roadmap.mdx` until Reviewer approval.

## Completion

- **Completed by**: Split into 014f1 and 014f2
- **Commands**:
  - See `agent/instructions/cloud/014f1-cloud-ui-faro-runtime-config.md`
  - See `agent/instructions/cloud/014f2-cloud-ui-faro-sdk-and-sanitized-events.md`
- **Date**: 2026-05-07
- **Reviewed by**: Codex Reviewer, 2026-05-07
