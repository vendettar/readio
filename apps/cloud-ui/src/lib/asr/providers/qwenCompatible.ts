import { FetchError, fetchWithFallback } from '../../fetchUtils'
import type { ASRProviderConfig } from '../registry'
import { ASRClientError, type ASRCue, type ASRTranscriptionResult } from '../types'

// --- Blob → Base64 Data URI conversion (browser-native) ---

async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('FileReader did not produce a string'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}

// --- Response parsing ---

interface QwenChatChoice {
  message?: {
    role?: string
    content?: string
  }
  delta?: {
    content?: string
  }
}

interface QwenChatCompletionResponse {
  choices?: QwenChatChoice[]
}

function mapStatusToError(status: number, message: string): ASRClientError {
  if (status === 401) return new ASRClientError(message, 'unauthorized', status)
  if (status === 413) return new ASRClientError(message, 'payload_too_large', status)
  if (status === 429) return new ASRClientError(message, 'rate_limited', status)
  if (status >= 500) return new ASRClientError(message, 'service_unavailable', status)
  return new ASRClientError(message, 'client_error', status)
}

function mapFetchErrorToAsrError(error: unknown): ASRClientError {
  if (error instanceof ASRClientError) return error

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new ASRClientError('ASR request aborted', 'aborted')
    }
    if (error.name === 'TypeError') {
      return new ASRClientError('Network request failed', 'network_error')
    }
    return new ASRClientError(error.message, 'network_error')
  }

  return new ASRClientError('Unknown ASR network error', 'network_error')
}

// --- Core transcription ---

interface TranscribeWithQwenOptions {
  blob: Blob
  apiKey: string
  model: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

/**
 * Transcribe audio using Qwen3-ASR via the chat/completions endpoint.
 *
 * Key differences from OpenAI-compatible:
 * - Endpoint is `/chat/completions`, not `/audio/transcriptions`
 * - Audio is sent as a Base64 Data URI inside a JSON message, not as multipart/form-data
 * - Response is plain text in `choices[0].message.content`, with no word-level timestamps
 */
export async function transcribeWithQwen({
  blob,
  apiKey,
  model,
  providerConfig,
  signal,
}: TranscribeWithQwenOptions): Promise<ASRTranscriptionResult> {
  if (!apiKey.trim()) {
    throw new ASRClientError(`Missing ${providerConfig.label} API key`, 'unauthorized', 401)
  }

  // 1. Convert blob to data URI (data:audio/mpeg;base64,...)
  const dataUri = await blobToDataUri(blob)

  // 2. Build JSON body following Qwen's chat/completions multimodal format
  const body = JSON.stringify({
    model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: {
              data: dataUri,
            },
          },
        ],
      },
    ],
    stream: false,
    asr_options: {
      enable_itn: false,
    },
  })

  let response: Response
  try {
    response = await fetch(providerConfig.transcribeEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      signal,
    })
  } catch (error) {
    throw mapFetchErrorToAsrError(error)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw mapStatusToError(
      response.status,
      text || `${providerConfig.label} transcribe failed with ${response.status}`
    )
  }

  let payload: QwenChatCompletionResponse
  try {
    payload = (await response.json()) as QwenChatCompletionResponse
  } catch {
    throw new ASRClientError(
      `Invalid ${providerConfig.label} response payload`,
      'service_unavailable'
    )
  }

  // 3. Extract text from chat completion response
  const text = payload.choices?.[0]?.message?.content?.trim() || ''

  // Qwen ASR returns only full text — no segment-level timestamps.
  // We produce a single cue spanning the entire audio.
  const cues: ASRCue[] = text
    ? [
        {
          start: 0,
          end: 0, // unknown; will be filled from chunk duration by the caller
          text,
        },
      ]
    : []

  return {
    cues,
    provider: providerConfig.id,
    model,
  }
}

// --- Key verification ---

interface VerifyQwenKeyOptions {
  apiKey: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

/**
 * Verify a Qwen (DashScope) API key by sending a minimal request.
 * We use the models list endpoint for DashScope.
 */
export async function verifyQwenKey({
  apiKey,
  providerConfig,
  signal,
}: VerifyQwenKeyOptions): Promise<boolean> {
  if (!apiKey.trim()) return false

  try {
    await fetchWithFallback<Response>(providerConfig.verifyEndpoint, {
      method: 'GET',
      raw: true,
      skipProxyOn4xx: true,
      purpose: 'ASR-Verify',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    })
    return true
  } catch (error: unknown) {
    if (error instanceof FetchError && error.status === 401) return false
    if (error instanceof FetchError && error.status) {
      throw mapStatusToError(
        error.status,
        `${providerConfig.label} verify failed with ${error.status}`
      )
    }
    throw mapFetchErrorToAsrError(error)
  }
}
