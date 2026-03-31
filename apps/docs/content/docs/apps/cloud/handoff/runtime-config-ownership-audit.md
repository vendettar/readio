# Cloud Runtime Config Ownership Audit

## Scope

This audit records the Cloud runtime-config ownership split implemented by instruction `009a-cloud-runtime-config-code-and-tests.md`.

The current Cloud runtime surface has three ownership buckets:

- server-owned runtime env in `apps/cloud-api`
- browser-public runtime config emitted by backend `/env.js`
- browser-local or user-local browser state

## 1. Server-owned runtime env

These values stay in backend runtime env and must not be emitted to browser `/env.js`.

| Key | Current owner | Representative reader | Why it stays server-owned |
| --- | --- | --- | --- |
| `PORT` | backend runtime env | `apps/cloud-api/main.go` | service listen address is backend-only |
| `READIO_CLOUD_UI_DIST_DIR` | backend runtime env | `apps/cloud-api/main.go` | static asset location is backend-only |
| `READIO_CLOUD_DB_PATH` | backend runtime env | `apps/cloud-api/main.go` | infrastructure/persistence path is backend-only |
| `READIO_ASR_ALLOWED_ORIGINS` | backend runtime env | `apps/cloud-api/asr_relay.go` | abuse-control and origin allowlist belong to backend |
| `READIO_ASR_RATE_LIMIT_BURST` | backend runtime env | `apps/cloud-api/asr_relay.go` | relay abuse-control knob |
| `READIO_ASR_RATE_LIMIT_WINDOW_MS` | backend runtime env | `apps/cloud-api/asr_relay.go` | relay abuse-control knob |
| `READIO_TRUSTED_PROXY_CIDRS` | backend runtime env | `apps/cloud-api/clientip.go` | trusted proxy CIDR list for client-IP derivation; backend-only, must not appear in browser `/env.js` |

## 2. Browser-public runtime config

These fields are safe to expose to the browser, but in production Cloud they should come from backend-generated `/env.js`, not static `dist/env.js`.

| Key | Production source after 009a | Representative browser reader | Notes |
| --- | --- | --- | --- |
| `READIO_APP_NAME` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | deployment-visible app label |
| `READIO_APP_VERSION` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | deployment-visible version label |
| `READIO_ASR_RELAY_PUBLIC_TOKEN` | backend `/env.js` allowlist (read from env var `READIO_ASR_RELAY_PUBLIC_TOKEN`, Go constant `asrRelayPublicTokenEnv` in `asr_relay.go:26`) | `apps/cloud-ui/src/lib/asr/backendRelay.ts` via `getAppConfig()` | browser-public abuse-control token; not a secret boundary |
| `READIO_ASR_PROVIDER` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | browser-visible default only |
| `READIO_ASR_MODEL` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | browser-visible default only |
| `READIO_ENABLED_ASR_PROVIDERS` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | browser-visible feature toggle |
| `READIO_DISABLED_ASR_PROVIDERS` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | browser-visible feature toggle |
| `READIO_EN_DICTIONARY_API_URL` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/selection/api.ts` via `getAppConfig()` | browser-visible endpoint choice |
| `READIO_EN_DICTIONARY_API_TRANSPORT` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/selection/api.ts` via `getAppConfig()` | explicit browser transport contract |
| `READIO_DISCOVERY_LOOKUP_URL` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/discovery/cloudApi.ts` via `getAppConfig()` | production Cloud now owns same-origin discovery roots |
| `READIO_DISCOVERY_SEARCH_URL` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/discovery/cloudApi.ts` via `getAppConfig()` | production Cloud now owns same-origin discovery roots |
| `READIO_RSS_FEED_BASE_URL` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/discovery/cloudApi.ts` via `getAppConfig()` | production Cloud now owns same-origin feed root |
| `READIO_DEFAULT_PODCAST_CONTENT_COUNTRY` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | deployment-visible UI default |
| `READIO_DEFAULT_LANGUAGE` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | deployment-visible UI default |
| `READIO_FALLBACK_PODCAST_IMAGE` | backend `/env.js` allowlist | `apps/cloud-ui/src/lib/runtimeConfig.ts` | browser-visible asset default |

## 3. Browser-local and user-local config/state

These values remain browser-owned and are not migrated into backend runtime env ownership in this phase.

| Key / state | Current owner | Representative reader | Why it remains browser-local |
| --- | --- | --- | --- |
| `READIO_ASR_API_KEY` | browser-local runtime / user settings | `apps/cloud-ui/src/lib/runtimeConfig.ts`, ASR flows | user-owned provider credential |
| `READIO_OPENAI_API_KEY` | browser-local runtime / user settings | `apps/cloud-ui/src/lib/runtimeConfig.ts` | user-owned provider credential |
| `READIO_CORS_PROXY_URL` and auth fields | browser-local runtime / user settings | `apps/cloud-ui/src/lib/fetchUtils.ts`, `src/lib/networking/proxyUrl.ts` | Cloud no longer treats these as production-owned runtime |
| `READIO_DB_NAME` | browser-local runtime | `apps/cloud-ui/src/lib/dexieDb.ts` | local IndexedDB namespace |
| audio/download/transcript cache settings | browser-local runtime | `storageQuota.ts`, `downloadCapacity.ts`, `dictCache.ts` | local storage quota behavior remains browser-owned |
| playback/session state | browser storage and in-memory stores | player stores and hooks | user/session-local state |

## 4. Production vs development contract

### Production Cloud

- `apps/cloud-api` serves `/env.js` before SPA/static fallback.
- Production Cloud no longer depends on `dist/env.js` as runtime truth.
- Backend emits only the explicit browser-safe allowlist.

### Frontend-only development

- `apps/cloud-ui/public/env.js` remains the safe default template.
- `apps/cloud-ui/public/env.local.js` remains the local override path.
- `apps/cloud-ui/src/lib/runtimeConfig.ts` still reads `window.__READIO_ENV__` in both environments.

## 5. Current risk notes

- If a field is emitted in `/env.js`, every browser user can read it; browser-public values are not secrets.
- `READIO_ASR_RELAY_PUBLIC_TOKEN` remains abuse-control only and must not be documented as a strong secret boundary.
- Browser-local fields such as user API keys remain intentionally outside backend runtime ownership in this phase.
