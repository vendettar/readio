# 005 - Future ASR Non-Groq Provider Expansion

## Status

Archived follow-up. Do not implement until the product decision explicitly re-opens
non-Groq BYOK providers.

## Current Contract

The cloud ASR backend is intentionally Groq-only.

- `apps/cloud-api/internal/asr/asr_relay.go` registers only the `groq` provider.
- `/api/v1/asr/transcriptions` rejects `qwen`, `deepgram`, `volcengine`, and unknown providers with `ASR_UNSUPPORTED_PROVIDER`.
- `/api/v1/asr/verify` follows the same contract.
- Frontend registry code may still know about non-Groq providers, but runtime toggles keep them disabled until a future rollout.

Do not keep inactive backend provider implementations in the live codebase. They
create a false support signal and increase credential-handling/security review
surface.

## Re-Opening Criteria

Before adding a non-Groq provider back to the backend, confirm all of the
following:

- The provider is enabled by product/runtime configuration, not only present in a registry.
- Transcription and key verification both have clear provider API contracts.
- Provider credentials remain browser-supplied, transient request data.
- No provider API key, full upstream response body, or sensitive request URL is logged.
- Request body limits, origin checks, public relay token checks, and rate limits still apply.
- Grafana/Loki labels continue to use low-cardinality provider/mode/status/error labels.

## Implementation Guidance

Re-implement provider support deliberately. Git history can be used as reference
material, but do not blindly restore old deleted code.

For each provider:

- Add a single provider config entry in `defaultASRRelayProviders`.
- Add the minimal transport implementation needed for that provider.
- Keep provider-specific response parsing isolated behind the transport function.
- Preserve `ASRRelayResponsePayload` as the backend response contract.
- Preserve `ASR_UNSUPPORTED_PROVIDER` for providers that are present in the frontend registry but not enabled in the backend.
- Prefer explicit provider error mapping over passing through upstream status text or response bodies.

## Required Tests

Each provider expansion must add or update backend tests for:

- successful transcription response shape
- successful verify response
- unsupported provider remains rejected when not registered
- unsupported model rejection
- missing API key rejection
- provider unauthorized response mapping
- provider rate-limit response mapping, including `Retry-After`
- provider service unavailable / timeout mapping
- malformed provider response mapping
- payload-too-large behavior
- API key and provider response body not leaking into logs or error payloads
- CORS preflight remains independent of provider support
- ASR relay metrics include provider and mode labels without high-cardinality values

Frontend tests must cover:

- runtime toggle keeps disabled providers unavailable
- enabled provider uses the same-origin relay for transcription
- enabled provider uses the same-origin relay for verify
- provider/model mismatch is rejected before relay submission

## Files To Revisit

- `apps/cloud-api/internal/asr/asr_relay.go`
- `apps/cloud-api/internal/asr/asr_relay_test.go`
- `apps/cloud-ui/src/lib/asr/registry.ts`
- `apps/cloud-ui/src/lib/asr/providerToggles.ts`
- `apps/cloud-ui/src/lib/asr/__tests__/index.providerToggleGuard.test.ts`
- `apps/docs/content/docs/apps/cloud/handoff/asr-relay-audit.md`
- `apps/docs/content/docs/apps/cloud/handoff/asr-relay-audit.zh.mdx`
