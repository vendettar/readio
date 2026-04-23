# Instruction 023: Implement Cloudflare Workers AI ASR Provider

Implement Cloudflare Workers AI as a new ASR provider for Readio. This enables a low-cost, scalable ASR alternative where the server provides the credentials for a "built-in" experience.

## 1. Decision Log
- **Decision**: Add `cloudflare` as a first-class ASR provider.
- **Rationale**: Cloudflare Workers AI (Whisper) offers competitive pricing ($0.0005/min). By using system-level credentials, we provide a "batteries-included" experience for users without requiring them to sign up for their own ASR accounts.
- **Approach**: 
    - Use Cloudflare's AI REST API directly from the `cloud-api` relay.
    - **System Credentials**: The backend will use `READIO_CF_ACCOUNT_ID` and `READIO_CF_API_TOKEN` if the user's API Key is empty.
    - **Base64 Encoding**: Cloudflare requires audio to be sent as a Base64 string in a JSON payload.
- **Bilingual Sync**: Required for `apps/docs`.

## 2. Affected Modules
- `apps/cloud-api/asr_relay.go`: Backend relay configuration and transport.
- `apps/lite/src/lib/asr/registry.ts`: Provider registration.
- `apps/lite/src/lib/asr/providers/cloudflare.ts`: (New) Frontend provider implementation.
- `apps/lite/src/lib/asr/providerToggles.ts`: Enable the provider.
- `apps/lite/src/lib/asr/index.ts`: Adjust chunk size for Cloudflare.
- `apps/docs/content/docs/`: Update ASR documentation.

## 3. Implementation Details

### Phase 1: Backend Relay Update (`apps/cloud-api`)

1.  **System-Level Egress**:
    - Load `READIO_CF_ACCOUNT_ID` and `READIO_CF_API_TOKEN` in `asrRelayService`.
    - In the `transcribe` method, if `provider == "cloudflare"` and `payload.APIKey == ""`, use the system credentials.
2.  **Specialized Transport (`cloudflare-ai`)**:
    - URL Template: `https://api.cloudflare.com/client/v4/accounts/%s/ai/run/%s`
    - Request: `POST` with `Authorization: Bearer <TOKEN>` and `Content-Type: application/json`.
    - Body: `{"audio": "<base64_data>", "language": "<optional_lang>"}`.
3.  **Error Mapping**:
    - Cloudflare 400/422 (Invalid Model/Params) -> `ASR_CLIENT_ERROR`.
    - Cloudflare 401/403 (Invalid Token/Account) -> `ASR_UNAUTHORIZED`.
    - Cloudflare 5xx -> `ASR_SERVICE_UNAVAILABLE`.

### Phase 2: Frontend Implementation (`apps/lite`)

1.  **Registry Configuration**:
    - `id`: `cloudflare`
    - `transport`: `cloudflare-ai` (to signal base64 encoding requirement).
    - `models`: `['@cf/openai/whisper', '@cf/openai/whisper-large-v3-turbo']`.
2.  **`providers/cloudflare.ts`**:
    - Convert `Blob` to Base64 using `FileReader` or `ArrayBuffer` + `btoa`.
    - Implement `transcribeWithCloudflare`:
        - Construct JSON payload.
        - Send to `cloud-api` relay.
        - Map response: Cloudflare returns `{"result": {"text": "...", "vtt": "..."}}`. If `vtt` is available, parse it into `ASRCue[]`. Otherwise, use `text` as a single cue.
3.  **Chunk Size Gating (`index.ts`)**:
    - Cloudflare has a **10MB total payload limit**.
    - Base64 encoding increases size by ~33%.
    - **Mandatory Logic**: If `provider === 'cloudflare'`, set `effectiveMaxBytes = 6 * 1024 * 1024` (6MB) to safely stay under the 10MB limit after encoding.

### Phase 3: UI & Documentation

1.  **Settings UI**:
    - If `provider === 'cloudflare'`, display a hint: "Using system-provided ASR (or enter your own AccountID:Token to override)".
    - API Key format for override: `ACCOUNT_ID:API_TOKEN`.
2.  **Documentation**:
    - Update `asr.mdx` to explain how to obtain Cloudflare credentials for self-hosting.

## 4. Verification Plan

### Automated Tests
- `apps/cloud-api/asr_relay_test.go`: Mock Cloudflare AI response and verify that system credentials are used when the request key is empty.
- `apps/lite/src/lib/asr/providers/__tests__/cloudflare.test.ts`: Verify Base64 conversion and VTT parsing.

### Manual Verification
1.  Set `READIO_CF_ACCOUNT_ID` and `READIO_CF_API_TOKEN` in backend env.
2.  Select "Cloudflare" in Settings (leave Key blank).
3.  Transcribe an episode and verify subtitle alignment.
