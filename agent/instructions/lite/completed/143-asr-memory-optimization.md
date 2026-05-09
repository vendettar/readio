# 143: ASR Multipart Buffer Convergence (Backend Memory Optimization) [COMPLETED]

## Objective
Optimize the ASR relay to reduce memory peaks during large multipart uploads by moving away from full-body buffering in memory.

## Context
Current `decodeMultipartRelayPayload` in `apps/cloud-api/asr_relay.go` uses `io.ReadAll(file)` which loads the entire audio file into memory. With a 20MB limit, this can lead to significant memory spikes under concurrent load.

## Proposed Changes

### 1. Refactor `apps/cloud-api/asr_relay.go`
- **Streaming Decoupling**: Updated `asrRelayRequestPayload` to hold an `io.ReadCloser` for the audio data.
- **Memory-Bound Multipart**: Ensured `ParseMultipartForm` uses a 2MB memory threshold while keeping the `bodyLimit` at 20MB.
- **Streaming Passthrough**: Refactored `transcribeOpenAICompatible`, `transcribeDeepgram`, and `transcribeViaWorker` to stream the audio directly from the reader to the upstream request body using `io.Pipe`.
- **Base64 Fallback**: Only buffer into memory for providers that strictly require Base64 encoding (Qwen, Volcengine), ensuring the buffer is cleared immediately after the request.

## Affected Modules
- `apps/cloud-api/asr_relay.go`

## Verification & Testing
- **Backend Tests**: `cd apps/cloud-api && go test ./...` passed.
- **Behavioral Assertion**:
  - Verified that Groq and Deepgram transcriptions still work with files of various sizes (via existing tests).
  - Verified that `ASR_PAYLOAD_TOO_LARGE` is still correctly enforced.

## Completion Section
- **Completed by**: Gemini CLI
- **Commands**: `cd apps/cloud-api && go test ./...`
- **Date**: 2026-05-09
- **Reviewed by**: Codex
