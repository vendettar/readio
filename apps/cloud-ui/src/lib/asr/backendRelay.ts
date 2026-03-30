import { ASRClientError, type ASRProvider, type ASRTranscriptionResult } from './types'

const ASR_RELAY_ROUTE = '/api/v1/asr/transcriptions'
const ASR_VERIFY_ROUTE = '/api/v1/asr/verify'

type ASRRelayErrorPayload = {
  code?: unknown
  message?: unknown
  status?: unknown
  retryAfterMs?: unknown
}

type ASRVerifyRelayResponsePayload = {
  ok?: unknown
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function blobToBase64(blob: Blob): Promise<string> {
  const withArrayBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }
  let buffer: ArrayBuffer
  if (typeof withArrayBuffer.arrayBuffer === 'function') {
    buffer = await withArrayBuffer.arrayBuffer()
  } else {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
      reader.readAsArrayBuffer(blob)
    })
  }
  return encodeBase64(new Uint8Array(buffer))
}

function mapRelayError(payload: ASRRelayErrorPayload, responseStatus: number): ASRClientError {
  const code = typeof payload.code === 'string' ? payload.code : 'service_unavailable'
  const message =
    typeof payload.message === 'string' ? payload.message : `ASR relay failed with ${responseStatus}`
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
    response = await fetch(ASR_RELAY_ROUTE, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        model,
        apiKey,
        audioBase64: await blobToBase64(blob),
        ...(blob.type ? { audioMimeType: blob.type } : {}),
      }),
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
