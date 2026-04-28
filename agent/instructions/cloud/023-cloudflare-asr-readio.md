# Instruction 023: Cloud Built-In Cloudflare ASR + Daily Quota Governance

Implement Cloudflare Workers AI ASR as the default built-in ASR experience for Cloud. In this contract, ordinary Cloud users should be able to trigger ASR without knowing or entering any provider API key. The backend owns the Cloudflare credentials, owns quota enforcement, and owns the operator-facing usage governance surface.

This instruction replaces the earlier draft that targeted `apps/lite` and overloaded empty `apiKey` semantics. The current implementation target is `apps/cloud-ui` + `apps/cloud-api`.

## 1. Decision Log

- **Decision**: Add `cloudflare` as a first-class ASR provider in Cloud, but treat it as a **backend-owned built-in provider**, not just another BYOK transport.
- **Decision**: Default Cloud ASR UX is **no-key required** for end users when built-in quota is available.
- **Decision**: If the user has configured a valid user-owned ASR provider/key, that user-owned path must take precedence over the built-in provider by default.
- **Decision**: Existing BYOK ASR flows remain supported as the fallback path when built-in quota is exhausted, but built-in Cloudflare is a separate product mode and must not be modeled as "empty key means special case".
- **Decision**: Built-in Cloudflare quota is a **global daily quota** for the Cloud deployment, enforced server-side, with a **hard stop** when exhausted.
- **Decision**: Built-in ASR requests must carry a stable request identity / idempotency key so retries, duplicate submits, and refresh-triggered replays do not double-consume quota.
- **Decision**: Built-in ASR needs both a **daily quota** and an **in-flight concurrency limit**. Daily quota controls budget; concurrency limit controls backend/upstream pressure.
- **Decision**: The admin surface under `/ops` becomes a small multi-page operator console with a left-side section nav. The first two sections are `Logs` and `ASR Usage`.
- **Decision**: Built-in provider/model selection is backend-owned. The browser may choose "built-in mode", but must not control the actual built-in Cloudflare model identifier.
- **Decision**: Admin-managed quota changes must be auditable, and built-in usage views must distinguish `reserved`, `consumed`, `released`, and `failed`.
- **Decision**: Built-in ASR storage/logging must follow a privacy-minimizing contract: no transcript text persistence, no raw audio persistence, no credential persistence.
- **Decision**: Per-user usage, per-user cap, and whitelist policy are explicitly deferred to `023b` because current Cloud handoff docs do **not** define a real multi-user identity contract yet.
- **Decision**: Built-in provider readiness and quota state must have their own contract. Do **not** overload the existing BYOK verification route with built-in readiness semantics.
- **Bilingual Sync**: Required for `apps/docs`.

## 2. Affected Modules

Backend:
- `apps/cloud-api/asr_relay.go`
- `apps/cloud-api/admin.go`
- `apps/cloud-api/main.go`
- `apps/cloud-api/main_test.go`
- New backend files are allowed if they narrow responsibilities cleanly, for example:
  - `apps/cloud-api/asr_builtin_usage.go`
  - `apps/cloud-api/asr_builtin_usage_test.go`
  - `apps/cloud-api/asr_builtin_admin.go`

Frontend:
- `apps/cloud-ui/src/lib/asr/types.ts`
- `apps/cloud-ui/src/lib/asr/registry.ts`
- `apps/cloud-ui/src/lib/asr/index.ts`
- `apps/cloud-ui/src/lib/asr/backendRelay.ts`
- `apps/cloud-ui/src/lib/asr/providerToggles.ts`
- `apps/cloud-ui/src/lib/adminApi.ts`
- `apps/cloud-ui/src/routes/ops.tsx`
- `apps/cloud-ui/src/routeComponents/AdminLogsPage.tsx`
- New ops route/layout files are allowed if they keep `/ops` operator-only and avoid `/admin/*` route collisions.

Docs:
- `apps/docs/content/docs/apps/cloud/README.mdx`
- `apps/docs/content/docs/apps/cloud/README.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/index.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/index.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/asr-relay-audit.md`
- `apps/docs/content/docs/apps/cloud/handoff/asr-relay-audit.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/runtime-config-ownership-audit.md`
- `apps/docs/content/docs/apps/cloud/deployment.mdx`
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx`

## 3. Product Contract

### 3.1 End-User ASR Behavior

- Cloud must expose a built-in ASR path that works without any user-entered provider key when the deployment is properly configured and quota is available.
- Built-in ASR is the default experience only for users who have **not** configured a valid user-owned ASR provider/key, or for users who explicitly select the built-in mode.
- The built-in provider should be clearly labeled in UI as a Cloud-provided mode, not as a generic BYOK provider.
- When built-in daily quota is exhausted, built-in ASR must stop immediately for normal users.
- On quota exhaustion, the user must see an actionable blocking message that tells them to configure their own ASR provider/key in Settings if they want to continue.
- Built-in quota exhaustion must **not** silently fall through to another provider. The fallback to BYOK must remain explicit and user-visible.

### 3.2 BYOK Boundary

- Existing BYOK ASR capability remains product-owned and must continue to work for providers that are still supported by the current Cloud contract.
- If the user has configured a valid ASR provider/model/apiKey, transcription should default to that user-owned path instead of consuming built-in Cloudflare quota.
- In `023`, do **not** add a Cloudflare-specific "user override token/account pair" path.
- Built-in Cloudflare quota accounting applies only to built-in requests. User-owned provider requests must not consume or be blocked by built-in quota state.
- When built-in Cloudflare quota is exhausted, the intended user action is to switch to an existing BYOK ASR mode, not to overload the built-in provider with mixed credential sources.

### 3.3 Effective Routing Priority

- The effective routing priority for `023` must be explicit:
  1. If the user has configured a valid user-owned ASR provider/key, default to that user-owned path.
  2. Otherwise, if built-in Cloudflare ASR is available, use built-in Cloudflare.
  3. Otherwise, surface a blocking action state that asks the user to configure their own ASR provider/key.
- If the UI exposes an explicit ASR mode selector, the selected mode may override the default, but the product must still make the default priority above unambiguous.
- Built-in readiness and built-in quota state must only influence requests that actually route to built-in Cloudflare. They must not block an otherwise valid BYOK request.

### 3.4 Built-In Readiness Boundary

- Built-in Cloudflare availability is **not** the same as BYOK key verification.
- Keep the existing BYOK verification surface scoped to user-owned credentials.
- Add a separate built-in status/readiness surface, for example:
  - `GET /api/v1/asr/builtin/status`
- That surface should return whether built-in ASR is currently available and, when unavailable, a machine-readable reason such as:
  - `not_configured`
  - `disabled`
  - `quota_exhausted`
  - `service_unavailable`

### 3.5 Built-In Error Semantics

- `023` should define a narrow built-in error matrix instead of collapsing all failures into generic relay errors.
- At minimum, built-in request handling should distinguish:
  - `ASR_BUILTIN_NOT_CONFIGURED`
  - `ASR_BUILTIN_DISABLED`
  - `ASR_BUILTIN_QUOTA_EXCEEDED`
  - `ASR_BUILTIN_BUSY`
  - `ASR_BUILTIN_INVALID_PAYLOAD`
  - `ASR_BUILTIN_SERVICE_UNAVAILABLE`
- The frontend should map these to distinct UX states where appropriate. In particular:
  - `quota_exceeded` -> prompt BYOK setup
  - `disabled` / `not_configured` -> built-in unavailable
  - `busy` -> retry-later semantics
  - `invalid_payload` -> caller/problem-state, not provider outage
- BYOK requests must continue to use their existing error semantics and must not be polluted by built-in-only errors.

## 4. Quota And Usage Contract

### 4.1 Daily Limit Scope

- `023` quota scope is **global per deployment**, not per user.
- The limit is a **daily limit**, reset on a deterministic UTC day boundary.
- The UI and docs must label the reset boundary explicitly as UTC in this phase.
- If the product later needs a business-timezone reset boundary, split that into a later instruction instead of making `023` ambiguous.

### 4.2 Quota Unit

- The primary enforced unit in `023` is **estimated audio seconds**, not exact provider invoice dollars.
- Admin UI may derive display minutes and an optional estimated cost view, but the hard enforcement contract must stay on a single narrow canonical unit.
- Do not claim that `023` reproduces Cloudflare billing perfectly. This is an operational quota guard, not an accounting ledger.

### 4.3 Request Identity And Idempotency

- Every built-in request must carry a stable request identity, for example `requestId` or `idempotencyKey`.
- The backend must treat retries of the same built-in request identity as the same accounting unit, not as new quota-consuming work.
- This applies to:
  - browser retry after transient failure
  - duplicate submit from UI race
  - page refresh / replay of the same chunk
  - backend-visible network retry where the first attempt may already have reserved quota
- The request identity should be persisted alongside the built-in usage ledger.
- BYOK requests do not need to share the same accounting semantics, but the relay contract should still allow a stable request identifier to flow through for debugging/correlation.

### 4.4 Reservation Model

- The backend should not wait until after upstream success to discover quota exhaustion.
- Because the relay does not cheaply know true audio duration from raw bytes alone, the client may submit a bounded `estimatedDurationSeconds` for each transcription chunk.
- The backend must validate that value as a positive bounded integer and use it as the operational quota unit for built-in requests.
- Use a reservation/finalization flow:
  1. Reserve estimated seconds before upstream call.
  2. Reject if the reservation would exceed today's limit.
  3. Finalize the reservation on success.
  4. Release or mark failed reservations on upstream failure, cancellation, or invalid payload.
- This reservation flow must be transaction-safe enough to avoid obvious concurrent overspend races.

### 4.5 In-Flight Concurrency And Backpressure

- Daily quota alone is insufficient. `023` should also define a built-in in-flight concurrency cap.
- This cap is global per deployment in the first phase.
- When the in-flight cap is reached, new built-in requests should fail fast with a dedicated busy/backpressure error instead of queueing unboundedly.
- The recommended default behavior is:
  - do not enqueue an internal unbounded backlog
  - reject excess built-in requests immediately with `ASR_BUILTIN_BUSY`
  - keep BYOK requests outside this built-in concurrency accounting unless a later instruction explicitly unifies the scheduler

### 4.6 Exhaustion Behavior

- When built-in quota is exhausted, return a dedicated error code, not a generic `unauthorized`.
- Recommended shape:
  - HTTP status: `403`
  - code: `ASR_BUILTIN_QUOTA_EXCEEDED`
  - message: explicit user-facing action, for example "Built-in Cloud ASR daily quota exhausted. Configure your own ASR provider to continue."
  - include a reset timestamp or reset date field if practical
- Frontend must map this code into a blocking UX state with a Settings CTA.

## 5. Backend Implementation Requirements

### 5.1 Provider Registration

- Add `cloudflare` to the Cloud backend provider registry in `apps/cloud-api/asr_relay.go`.
- The Cloudflare transport must be modeled explicitly, for example `cloudflare-ai`.
- Use the current Cloudflare Workers AI REST contract that fits the chosen model path.
- Do not rely on the stale `apps/lite`-era assumptions from the old draft.
- Built-in Cloudflare model selection must be backend-owned and pinned to a narrow allowlist or a single configured model.
- The browser must not be allowed to choose arbitrary Cloudflare built-in model identifiers for cost and behavior reasons.

### 5.2 Server-Owned Credentials

- The backend owns:
  - `READIO_CF_ACCOUNT_ID`
  - `READIO_CF_API_TOKEN`
- These values remain server-owned runtime env and must never be emitted via `/env.js`.
- Built-in Cloudflare ASR is available only when the required server credentials are present and the built-in quota policy is enabled.

### 5.3 Separate Built-In Status Surface

- Add a dedicated built-in status endpoint for browser UX and startup readiness checks.
- Keep it narrow. It should answer:
  - Is built-in ASR enabled?
  - Is backend configuration complete?
  - Is built-in quota currently available?
  - What is the current unavailability reason, if any?
- Do not leak secrets or raw admin settings through this surface.

### 5.4 Persistence

- Because ops must be able to update the daily limit at runtime, `023` requires minimal persistent backend storage for:
  - built-in ASR quota policy
  - built-in ASR usage reservations/events
  - admin-side quota/policy audit events
- Use Cloud SQLite, not browser state and not env.js, for mutable admin-managed quota state.
- Keep schema narrow and additive. Avoid inventing a large generic config subsystem if two small tables will do.

Recommended minimal backend persistence split:
- `asr_builtin_quota_config`
  - `id`
  - `enabled`
  - `daily_limit_seconds`
  - `updated_at`
- `asr_builtin_usage_events`
  - `id`
  - `request_id`
  - `day_key_utc`
  - `provider`
  - `model`
  - `estimated_seconds`
  - `status` (`reserved`, `consumed`, `released`, `failed`)
  - `failure_reason`
  - `created_at`
  - `finalized_at`
- `asr_builtin_admin_audit`
  - `id`
  - `action`
  - `actor_hint`
  - `before_json`
  - `after_json`
  - `created_at`

The exact table names may differ, but the separation of policy vs usage ledger should remain.

### 5.5 Fail-Fast Limits

- `023` should define built-in-only fail-fast limits before upstream submission, at minimum:
  - max audio bytes per built-in request
  - max `estimatedDurationSeconds` per built-in request
  - max built-in chunks per end-user transcription task if the task-level boundary is available in the client contract
- Reject these locally with built-in/client payload errors rather than letting unexpectedly large requests consume upstream budget.

### 5.6 Retention And Cleanup

- The built-in usage ledger must define a retention strategy in `023`.
- At minimum:
  - detailed usage events should have a finite retention window
  - old rows should be cleaned up or compacted
  - the ops summary view should not depend on unbounded table growth
- If daily aggregates are introduced, they should be additive to the event ledger, not a reason to stop recording enough event-level state for debugging current-day anomalies.

### 5.7 Logging And Privacy

- Log built-in reservation, consume, release, reject, and busy/backpressure paths with canonical route/error fields so admin logs remain usable.
- Do not log provider secrets, admin tokens, or raw uploaded audio metadata that is unnecessary for operations.
- Do not persist:
  - raw audio bodies
  - transcript text
  - user/provider credentials
  - full sensitive upstream error payloads when a redacted summary will do
- If request correlation is needed, prefer stable opaque identifiers such as `requestId` instead of user content.

### 5.8 Forward-Compatible Subject Hooks

- `023` should remain global-quota-only, but the built-in usage schema should leave room for a later `023b` migration without destructive rewrites.
- It is acceptable to add an optional future-facing field such as `subject_hint` or `installation_id` placeholder, as long as:
  - it is not treated as a real per-user policy boundary in `023`
  - it is clearly documented as non-authoritative until `023b`

## 6. Frontend Implementation Requirements

### 6.1 ASR Mode UX

- Add a user-facing built-in ASR mode in `apps/cloud-ui`.
- Built-in mode should not ask the user for a provider key.
- BYOK settings remain available as the explicit advanced/fallback path.
- If the user has already configured a valid user-owned ASR provider/key, the frontend should default new transcription attempts to that user-owned path unless the user explicitly chooses built-in mode.
- If built-in quota is exhausted, show a clear Settings CTA that leads the user to configure their own ASR provider/key.

### 6.2 Relay Contract Changes

- `transcribeViaCloudRelay()` currently hard-fails on empty `apiKey`. That must be narrowed.
- For built-in Cloudflare mode, the frontend must be able to call the relay without a user key.
- Do not model this as a generic "empty key is always fine". Keep the exception explicit and provider-aware.
- The request path should also carry:
  - `estimatedDurationSeconds` for built-in quota reservation
  - a stable built-in request identity / idempotency key
- If task-level context exists in the client, the relay payload may also carry bounded metadata such as chunk index / total chunks for fail-fast task validation.

### 6.3 Provider Registry And Toggle Contract

- Update `apps/cloud-ui/src/lib/asr/types.ts` and `registry.ts` to include `cloudflare`.
- Remove or narrow the current forced `groq`-only provider filter in `providerToggles.ts` so the intended provider list can actually surface.
- Default Cloud runtime/provider settings should prefer the built-in Cloudflare mode once the deployment is configured for it.
- However, effective runtime routing must still prioritize a valid user-owned provider/key over built-in unless the user explicitly opts into built-in mode.

### 6.4 Built-In Status UX

- The frontend should be able to read built-in status and show:
  - available
  - unavailable because not configured
  - unavailable because quota exhausted
  - unavailable because service is down
- Treat `quota_exhausted` as a user-action state with a Settings CTA, not as an opaque generic failure.
- Do not surface built-in quota/status errors when the current request is routing to a valid user-owned provider/key.
- If built-in is temporarily busy, the UI should prefer a retry-later / overloaded state rather than mislabeling the system as disabled or quota-exhausted.

## 7. Ops / Admin Surface Requirements

### 7.1 Ops Route Shape

- Keep the operator surface under `/ops`, not `/admin`, to avoid collisions with backend JSON APIs.
- Refactor the current single-page `/ops` experience into a small ops shell with a **left-side section nav**.
- Minimum sections in `023`:
  - `Logs`
  - `ASR Usage`
- Direct `/ops` should redirect or default to the first section, for example `/ops/logs`.

### 7.2 Left Navigation

- The left-side section nav should feel like an operator-local analogue of the main app sidebar language, not a disconnected raw debug page.
- It does **not** need to be added to the global Cloud app sidebar in `apps/cloud-ui/src/components/AppShell/Sidebar.tsx`.
- It should live inside the ops surface and remain operator-only.

### 7.3 ASR Usage Page

- Add a new operator page in the ops surface for built-in ASR governance.
- Minimum page requirements:
  - current built-in status
  - current daily limit
  - current in-flight limit
  - today's consumed seconds/minutes
  - remaining quota
  - reset boundary label (`UTC`)
  - current-day reservation breakdown by status: `reserved`, `consumed`, `released`, `failed`
  - recent usage events
  - form to enable/disable built-in mode
  - form to set/update daily limit
  - explicit emergency stop / kill-switch action semantics
- If cost estimation is shown, label it clearly as estimated and derived from the configured rate assumption.
- If usage events are shown, they should prefer operational fields such as request id, timestamps, model, estimated seconds, and status. Do not show transcript text or raw audio metadata.

### 7.4 Admin Audit Visibility

- The ops surface should expose enough audit history to answer:
  - who or what changed built-in policy
  - when the change happened
  - what values changed
- If the current admin surface has no real operator identity, `actor_hint` may be limited, but the audit trail should still record the event itself.

### 7.5 Admin APIs

- Add admin-only APIs protected by the existing admin bearer token contract.
- Recommended minimum endpoints:
  - `GET /admin/asr/builtin/quota`
  - `PUT /admin/asr/builtin/quota`
  - `GET /admin/asr/builtin/usage/summary`
  - `GET /admin/asr/builtin/usage/events`
  - `GET /admin/asr/builtin/audit`
- Keep all admin responses `Cache-Control: no-store`.
- Do not emit admin token or admin-only URLs into `/env.js`.
- The quota policy update contract should also cover:
  - built-in enable/disable
  - emergency kill switch behavior
  - in-flight concurrency limit
  - daily limit
- If a same-day manual reset operation is introduced, it must be auditable and explicitly guarded; do not make silent destructive quota resets a casual UI action.

## 8. Documentation Requirements

- Rewrite Cloud docs to reflect the new ownership split accurately:
  - built-in Cloudflare ASR is backend-owned
  - BYOK ASR remains user-owned
  - built-in readiness is separate from BYOK verification
  - built-in quota policy is backend-owned and admin-managed
- Deployment docs must document:
  - `READIO_CF_ACCOUNT_ID`
  - `READIO_CF_API_TOKEN`
  - any built-in ASR rate/cost/env assumptions added in code
  - any built-in in-flight concurrency/env assumptions added in code
  - the `/ops` operator surface
  - the admin token contract for `/admin/*`
- Handoff docs must stop claiming that all Cloud ASR credentials are user-owned once `023` lands.
- Docs must also make the privacy boundary explicit: built-in usage governance stores operational quota/accounting state, not transcript content or raw audio.

## 9. Do Not

- Do not target `apps/lite`; this is a Cloud-only instruction.
- Do not use "empty apiKey means built-in" as the only contract.
- Do not collapse built-in readiness into the existing BYOK verification semantics.
- Do not silently auto-switch users to another provider when built-in quota is exhausted.
- Do not let built-in quota exhaustion or built-in health state block a valid user-owned ASR request.
- Do not allow the browser to choose arbitrary built-in Cloudflare models.
- Do not let duplicate retries consume built-in quota multiple times for the same logical request.
- Do not keep built-in usage/audit rows forever without a cleanup policy.
- Do not make per-user quota claims in `023`; that belongs in `023b`.
- Do not expose Cloudflare server credentials, admin token material, or mutable quota policy through `/env.js`.
- Do not build a large generalized billing system in this instruction.

## 10. Verification Plan

### Automated Tests

Backend:
1. Built-in Cloudflare transcription succeeds without user key when server credentials and quota are available.
2. Replays/retries of the same built-in request identity do not double-consume quota.
3. Built-in request is rejected with `ASR_BUILTIN_QUOTA_EXCEEDED` when reservation would exceed today's limit.
4. Failed or aborted built-in requests release reservations and do not permanently consume quota.
5. Built-in in-flight cap rejects excess requests with a built-in busy error instead of queueing unboundedly.
6. When a valid user-owned provider/key is configured, transcription routes to the user-owned path and does not consume built-in quota.
7. BYOK providers still require user credentials and are unaffected by built-in mode.
8. Built-in status endpoint reports `not_configured`, `disabled`, `quota_exhausted`, and healthy states correctly.
9. Built-in fail-fast byte/duration limits reject oversized requests before upstream.
10. Admin quota endpoints require valid admin bearer token and return `no-store`.
11. Admin policy changes create auditable records.

Frontend:
1. Built-in Cloudflare mode can submit relay requests without user key.
2. Built-in mode sends bounded `estimatedDurationSeconds`.
3. Built-in mode sends a stable request identity / idempotency key.
4. If a valid user-owned provider/key is configured, the frontend routes transcription to that user-owned path by default.
5. Built-in quota exhaustion error shows blocking UX with Settings CTA only when the request actually targets built-in Cloudflare.
6. Built-in busy/backpressure error renders a retry-later state distinct from quota exhaustion.
7. Ops route renders left nav with `Logs` and `ASR Usage`.
8. ASR Usage page can read and update quota policy through admin APIs.
9. Ops usage UI shows reservation breakdown and does not expose transcript/raw-audio content.

### Manual Verification

1. Configure `READIO_CF_ACCOUNT_ID` and `READIO_CF_API_TOKEN` in backend runtime env.
2. Set a small positive daily limit and a small in-flight cap in the ops page.
3. Use built-in ASR without entering any provider key.
4. Consume enough usage to exceed the daily limit.
5. Confirm later built-in ASR attempts are blocked with a clear BYOK instruction.
6. Retry the same logical built-in request and confirm quota is not double-counted.
7. Configure a valid user-owned provider/key and confirm subsequent transcription attempts prefer the user-owned path and do not decrement built-in quota.
8. Confirm `/ops/asr-usage` reflects only built-in consumed quota and remaining quota correctly, with clear `reserved/consumed/released/failed` breakdown.
9. Confirm an existing BYOK provider path still works after built-in quota exhaustion.
10. Trigger a policy change in ops and confirm an audit record is visible.

## 11. Return

1. Files changed
2. Built-in ASR contract summary
3. Admin APIs added/changed
4. Ops routes/pages added/changed
5. Doc files updated
6. Verification results
