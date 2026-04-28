import { getAppConfig } from '../runtimeConfig'
import { ASRClientError, type ASRProvider, type ASRTranscriptionResult } from './types'

const ASR_RELAY_ROUTE = '/api/v1/asr/transcriptions'
const ASR_VERIFY_ROUTE = '/api/v1/asr/verify'
const ASR_RELAY_PUBLIC_TOKEN_HEADER = 'X-Readio-Relay-Public-Token'

type ASRRelayErrorPayload = {
  code?: unknown
  message?: unknown
  status?: unknown
  retryAfterMs?: unknown
}

type ASRVerifyRelayResponsePayload = {
  ok?: unknown
}

function relayAudioExtensionForMimeType(mimeType: string): string {
  const lowerMimeType = mimeType.toLowerCase()
  if (lowerMimeType.includes('wav')) return 'wav'
  if (
    lowerMimeType.includes('mp4') ||
    lowerMimeType.includes('m4a') ||
    lowerMimeType.includes('x-m4a')
  ) {
    return 'm4a'
  }
  if (lowerMimeType.includes('webm')) return 'webm'
  if (lowerMimeType.includes('ogg')) return 'ogg'
  if (lowerMimeType.includes('flac')) return 'flac'
  if (lowerMimeType.includes('aac')) return 'aac'
  return 'mp3'
}

function toRelayAudioFile(blob: Blob): File {
  const fileName = `audio.${relayAudioExtensionForMimeType(blob.type)}`
  if (blob instanceof File) return new File([blob], fileName, { type: blob.type })
  return new File([blob], fileName, { type: blob.type || 'audio/mpeg' })
}

function getRelayHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  const token = getAppConfig().ASR_RELAY_PUBLIC_TOKEN.trim()
  if (!token) return headers
  return {
    ...(headers ?? {}),
    [ASR_RELAY_PUBLIC_TOKEN_HEADER]: token,
  }
}

function mapRelayError(payload: ASRRelayErrorPayload, responseStatus: number): ASRClientError {
  let rawCode = typeof payload.code === 'string' ? payload.code : 'service_unavailable'
  // Normalize backend-prefixed codes (e.g., ASR_UNAUTHORIZED -> unauthorized)
  if (rawCode.toUpperCase().startsWith('ASR_')) {
    rawCode = rawCode.substring(4)
  }
  const code = rawCode.toLowerCase()

  const message =
    typeof payload.message === 'string'
      ? payload.message
      : `ASR relay failed with ${responseStatus}`
  const status = typeof payload.status === 'number' ? payload.status : responseStatus
  const retryAfterMs = typeof payload.retryAfterMs === 'number' ? payload.retryAfterMs : undefined

  switch (code) {
    case 'unauthorized':
    case 'payload_too_large':
    case 'service_unavailable':
    case 'client_error':
    case 'rate_limited':
      return new ASRClientError(message, code, status, retryAfterMs)
    default:
      return new ASRClientError(message, 'service_unavailable', status, retryAfterMs)
  }
}

export async function transcribeViaCloudRelay(options: {
  blob: Blob
  apiKey: string
  model: string
  provider: ASRProvider
  signal?: AbortSignal
}): Promise<ASRTranscriptionResult> {
  const { blob, apiKey, model, provider, signal } = options
  if (!apiKey.trim()) {
    throw new ASRClientError(`Missing ${provider} API key`, 'unauthorized', 401)
  }

  let response: Response
  try {
    const formData = new FormData()
    formData.set('provider', provider)
    formData.set('model', model)
    formData.set('apiKey', apiKey)
    formData.set('audio', toRelayAudioFile(blob))
    if (blob.type) {
      formData.set('audioMimeType', blob.type)
    }

    response = await fetch(ASR_RELAY_ROUTE, {
      method: 'POST',
      signal,
      headers: getRelayHeaders(),
      body: formData,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ASRClientError('ASR request aborted', 'aborted')
    }
    throw new ASRClientError(
      error instanceof Error ? error.message : 'ASR relay network error',
      'network_error'
    )
  }

  if (!response.ok) {
    let payload: ASRRelayErrorPayload = {}
    try {
      payload = (await response.json()) as ASRRelayErrorPayload
    } catch {
      payload = {}
    }
    throw mapRelayError(payload, response.status)
  }

  try {
    return (await response.json()) as ASRTranscriptionResult
  } catch {
    throw new ASRClientError('Invalid ASR relay response payload', 'service_unavailable')
  }
}

export async function verifyAsrKeyViaCloudRelay(options: {
  apiKey: string
  provider: ASRProvider
  signal?: AbortSignal
}): Promise<boolean> {
  const { apiKey, provider, signal } = options
  if (!apiKey.trim()) return false

  let response: Response
  try {
    response = await fetch(ASR_VERIFY_ROUTE, {
      method: 'POST',
      signal,
      headers: {
        ...(getRelayHeaders() ?? {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        apiKey,
      }),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ASRClientError('ASR verify request aborted', 'aborted')
    }
    throw new ASRClientError(
      error instanceof Error ? error.message : 'ASR verify relay network error',
      'network_error'
    )
  }

  if (!response.ok) {
    let payload: ASRRelayErrorPayload = {}
    try {
      payload = (await response.json()) as ASRRelayErrorPayload
    } catch {
      payload = {}
    }
    throw mapRelayError(payload, response.status)
  }

  let payload: ASRVerifyRelayResponsePayload = {}
  try {
    payload = (await response.json()) as ASRVerifyRelayResponsePayload
  } catch {
    throw new ASRClientError('Invalid ASR verify relay response payload', 'service_unavailable')
  }
  if (payload.ok === true) return true
  throw new ASRClientError('Invalid ASR verify relay response payload', 'service_unavailable')
}
