import type { ASRProviderConfig } from '../registry'
import { ASRClientError, type ASRCue, type ASRTranscriptionResult, type ASRWord } from '../types'

// ---------------------------------------------------------------------------
// Volcengine ASR Quick (Flash) response types
// ---------------------------------------------------------------------------

type VolcengineWord = {
  text?: unknown
  start_time?: unknown
  end_time?: unknown
  confidence?: unknown
}

type VolcengineUtterance = {
  text?: unknown
  start_time?: unknown
  end_time?: unknown
  words?: unknown
}

type VolcengineResponse = {
  audio_info?: { duration?: unknown }
  result?: {
    text?: unknown
    utterances?: unknown
    additions?: { duration?: unknown }
  }
}

// ---------------------------------------------------------------------------
// Header-level status codes used by Volcengine ASR Quick
// ---------------------------------------------------------------------------

const VOLCENGINE_STATUS_SUCCESS = '20000000'
const VOLCENGINE_STATUS_SILENCE = '20000003'
const VOLCENGINE_MAX_AUDIO_BYTES = 100 * 1024 * 1024

// ---------------------------------------------------------------------------
// Credential encoding: "appId:accessToken"
// ---------------------------------------------------------------------------

export function parseVolcengineCredentials(apiKey: string): { appId: string; accessToken: string } {
  const separator = apiKey.indexOf(':')
  if (separator <= 0 || separator >= apiKey.length - 1) {
    throw new ASRClientError(
      'Volcengine API key must be in the format "appId:accessToken"',
      'unauthorized',
      401
    )
  }
  const appId = apiKey.slice(0, separator).trim()
  const accessToken = apiKey.slice(separator + 1).trim()
  if (!appId || !accessToken) {
    throw new ASRClientError(
      'Volcengine API key must be in the format "appId:accessToken"',
      'unauthorized',
      401
    )
  }
  return { appId, accessToken }
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

/** Volcengine returns timestamps in milliseconds; convert to seconds. */
function msToSeconds(ms: number): number {
  return ms / 1000
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapStatusToError(status: number, message: string): ASRClientError {
  if (status === 401 || status === 403) return new ASRClientError(message, 'unauthorized', status)
  if (status === 413) return new ASRClientError(message, 'payload_too_large', status)
  if (status === 429) return new ASRClientError(message, 'rate_limited', status)
  if (status >= 500) return new ASRClientError(message, 'service_unavailable', status)
  return new ASRClientError(message, 'client_error', status)
}

function mapVolcengineStatusCode(code: string, logId: string): ASRClientError | null {
  if (code === VOLCENGINE_STATUS_SUCCESS || code === VOLCENGINE_STATUS_SILENCE) return null

  const codeNum = Number(code)
  if (code.startsWith('450')) {
    return new ASRClientError(
      `Volcengine request error (${code}), logId: ${logId}`,
      'client_error',
      codeNum
    )
  }
  if (code.startsWith('550')) {
    return new ASRClientError(
      `Volcengine server error (${code}), logId: ${logId}`,
      'service_unavailable',
      codeNum
    )
  }
  return new ASRClientError(
    `Volcengine unknown error (${code}), logId: ${logId}`,
    'service_unavailable',
    codeNum
  )
}

function mapFetchErrorToAsrError(error: unknown): ASRClientError {
  if (error instanceof ASRClientError) return error
  if (error instanceof Error) {
    if (error.name === 'AbortError') return new ASRClientError('ASR request aborted', 'aborted')
    if (error.name === 'TypeError')
      return new ASRClientError('Network request failed', 'network_error')
    return new ASRClientError(error.message, 'network_error')
  }
  return new ASRClientError('Unknown ASR network error', 'network_error')
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseVolcengineWord(item: unknown): ASRWord | null {
  if (!item || typeof item !== 'object') return null
  const row = item as VolcengineWord
  const text = typeof row.text === 'string' ? row.text.trim() : ''
  const startMs = parseFiniteNumber(row.start_time)
  const endMs = parseFiniteNumber(row.end_time)
  if (!text || startMs === null || endMs === null || startMs < 0 || endMs < 0 || endMs < startMs) {
    return null
  }

  const confidence = parseFiniteNumber(row.confidence)
  return {
    word: text,
    start: msToSeconds(startMs),
    end: msToSeconds(endMs),
    ...(confidence !== null && confidence > 0 ? { confidence } : {}),
  }
}

function parseVolcengineUtteranceCues(payload: VolcengineResponse): {
  cues: ASRCue[]
  durationSeconds: number | undefined
} {
  const utterances = payload.result?.utterances
  if (!Array.isArray(utterances) || utterances.length === 0) {
    // Fallback: top-level text only
    const text = typeof payload.result?.text === 'string' ? payload.result.text.trim() : ''
    if (text) {
      return {
        cues: [{ start: 0, end: 0, text }],
        durationSeconds: undefined,
      }
    }
    return { cues: [], durationSeconds: undefined }
  }

  const cues: ASRCue[] = []

  for (const utt of utterances) {
    if (!utt || typeof utt !== 'object') continue
    const row = utt as VolcengineUtterance
    const text = typeof row.text === 'string' ? row.text.trim() : ''
    if (!text) continue

    const words: ASRWord[] = Array.isArray(row.words)
      ? row.words.map(parseVolcengineWord).filter((w): w is ASRWord => w !== null)
      : []
    const wordStart = words.length > 0 ? Math.min(...words.map((word) => word.start)) : undefined
    const wordEnd = words.length > 0 ? Math.max(...words.map((word) => word.end)) : undefined

    const startMs = parseFiniteNumber(row.start_time)
    const endMs = parseFiniteNumber(row.end_time)

    const start =
      startMs !== null && startMs >= 0
        ? msToSeconds(startMs)
        : wordStart !== undefined
          ? wordStart
          : 0
    let end =
      endMs !== null && endMs >= 0 ? msToSeconds(endMs) : wordEnd !== undefined ? wordEnd : start
    if (end < start) end = start

    cues.push({
      start,
      end,
      text,
      ...(words.length > 0 ? { words } : {}),
    })
  }

  // Duration: prefer audio_info.duration (ms), then additions.duration (ms string)
  let durationSeconds: number | undefined
  const audioDurationMs = parseFiniteNumber(payload.audio_info?.duration)
  if (audioDurationMs !== null && audioDurationMs > 0) {
    durationSeconds = msToSeconds(audioDurationMs)
  } else {
    const additionsDurationMs = parseFiniteNumber(payload.result?.additions?.duration)
    if (additionsDurationMs !== null && additionsDurationMs > 0) {
      durationSeconds = msToSeconds(additionsDurationMs)
    } else if (cues.length > 0) {
      const lastCue = cues[cues.length - 1]
      if (lastCue.end > 0) durationSeconds = lastCue.end
    }
  }

  return { cues, durationSeconds }
}

// ---------------------------------------------------------------------------
// Base64 encoding helper
// ---------------------------------------------------------------------------

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      // dataUrl format: "data:<mime>;base64,<data>"
      const commaIdx = dataUrl.indexOf(',')
      resolve(commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}

// ---------------------------------------------------------------------------
// Transcribe
// ---------------------------------------------------------------------------

interface TranscribeWithVolcengineOptions {
  blob: Blob
  apiKey: string
  model: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

export async function transcribeWithVolcengine({
  blob,
  apiKey,
  model,
  providerConfig,
  signal,
}: TranscribeWithVolcengineOptions): Promise<ASRTranscriptionResult> {
  if (blob.size > VOLCENGINE_MAX_AUDIO_BYTES) {
    throw new ASRClientError(
      `Volcengine ASR supports up to 100MB audio. Received ${blob.size} bytes.`,
      'payload_too_large',
      413
    )
  }

  const { appId, accessToken } = parseVolcengineCredentials(apiKey)

  const base64Audio = await blobToBase64(blob)

  const body = JSON.stringify({
    user: { uid: appId },
    audio: { data: base64Audio },
    request: { model_name: model },
  })

  let response: Response
  try {
    response = await fetch(providerConfig.transcribeEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Key': appId,
        'X-Api-Access-Key': accessToken,
        'X-Api-Resource-Id': 'volc.bigasr.auc_turbo',
        'X-Api-Request-Id': crypto.randomUUID(),
        'X-Api-Sequence': '-1',
      },
      body,
      signal,
    })
  } catch (error) {
    throw mapFetchErrorToAsrError(error)
  }

  // Volcengine returns status info in headers
  const statusCode = response.headers.get('X-Api-Status-Code') ?? ''
  const apiMessage = response.headers.get('X-Api-Message') ?? ''
  const logId = response.headers.get('X-Tt-Logid') ?? ''

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw mapStatusToError(
      response.status,
      text ||
        apiMessage ||
        `${providerConfig.label} transcribe failed with HTTP ${response.status}, logId: ${logId}`
    )
  }

  if (!statusCode) {
    throw new ASRClientError(
      `Missing Volcengine status code header, logId: ${logId || 'unknown'}`,
      'service_unavailable'
    )
  }

  // Check Volcengine-specific status code from headers
  if (
    statusCode &&
    statusCode !== VOLCENGINE_STATUS_SUCCESS &&
    statusCode !== VOLCENGINE_STATUS_SILENCE
  ) {
    const volcError = mapVolcengineStatusCode(statusCode, logId)
    if (volcError) throw volcError
  }

  let payload: VolcengineResponse
  try {
    payload = (await response.json()) as VolcengineResponse
  } catch {
    throw new ASRClientError(
      `Invalid ${providerConfig.label} response payload, logId: ${logId}`,
      'service_unavailable'
    )
  }

  // Handle silence response
  if (statusCode === VOLCENGINE_STATUS_SILENCE) {
    return {
      cues: [],
      durationSeconds: undefined,
      provider: providerConfig.id,
      model,
    }
  }

  const { cues, durationSeconds } = parseVolcengineUtteranceCues(payload)

  if (cues.length === 0) {
    throw new ASRClientError('Volcengine returned empty transcript', 'service_unavailable')
  }

  return {
    cues,
    durationSeconds,
    provider: providerConfig.id,
    model,
  }
}

// ---------------------------------------------------------------------------
// Verify key
// ---------------------------------------------------------------------------

interface VerifyVolcengineKeyOptions {
  apiKey: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

/**
 * Volcengine ASR Quick has no lightweight "list models" endpoint.
 * We verify by sending a tiny silent audio payload and checking the status.
 * A successful response or a "silence" status both confirm valid credentials.
 */
export async function verifyVolcengineKey({
  apiKey,
  providerConfig,
  signal,
}: VerifyVolcengineKeyOptions): Promise<boolean> {
  if (!apiKey.trim()) return false

  const { appId, accessToken } = parseVolcengineCredentials(apiKey)

  // Minimal WAV: 44-byte header + 160 bytes of silence (8kHz, 16-bit mono, 10ms)
  const wavHeader = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF"
    0xcc,
    0x00,
    0x00,
    0x00, // File size - 8
    0x57,
    0x41,
    0x56,
    0x45, // "WAVE"
    0x66,
    0x6d,
    0x74,
    0x20, // "fmt "
    0x10,
    0x00,
    0x00,
    0x00, // Chunk size (16)
    0x01,
    0x00, // PCM format
    0x01,
    0x00, // 1 channel
    0x40,
    0x1f,
    0x00,
    0x00, // 8000 Hz
    0x80,
    0x3e,
    0x00,
    0x00, // byte rate
    0x02,
    0x00, // block align
    0x10,
    0x00, // 16 bits per sample
    0x64,
    0x61,
    0x74,
    0x61, // "data"
    0xa0,
    0x00,
    0x00,
    0x00, // data size (160 bytes)
  ])
  const silenceData = new Uint8Array(160)
  const silenceWav = new Uint8Array(wavHeader.length + silenceData.length)
  silenceWav.set(wavHeader, 0)
  silenceWav.set(silenceData, wavHeader.length)

  const base64Audio = btoa(String.fromCharCode(...silenceWav))

  const body = JSON.stringify({
    user: { uid: appId },
    audio: { data: base64Audio },
    request: { model_name: 'bigmodel' },
  })

  try {
    const response = await fetch(providerConfig.verifyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Key': appId,
        'X-Api-Access-Key': accessToken,
        'X-Api-Resource-Id': 'volc.bigasr.auc_turbo',
        'X-Api-Request-Id': crypto.randomUUID(),
        'X-Api-Sequence': '-1',
      },
      body,
      signal,
    })

    if (response.status === 401 || response.status === 403) return false

    if (!response.ok) {
      const apiMessage = response.headers.get('X-Api-Message') ?? ''
      throw mapStatusToError(
        response.status,
        apiMessage || `${providerConfig.label} verify failed with HTTP ${response.status}`
      )
    }

    const statusCode = response.headers.get('X-Api-Status-Code') ?? ''
    if (statusCode === VOLCENGINE_STATUS_SUCCESS || statusCode === VOLCENGINE_STATUS_SILENCE) {
      return true
    }

    // Volcengine business errors that aren't success/silence should be treated as
    // invalid keys if they're 4xx style, or service unavailable if 5xx.
    if (statusCode.startsWith('550')) {
      throw new ASRClientError(
        `Volcengine server error during verification (${statusCode})`,
        'service_unavailable'
      )
    }

    // Default for other 450* or unknown business codes on verify is false (invalid key)
    return false
  } catch (error) {
    if (error instanceof ASRClientError) throw error
    throw mapFetchErrorToAsrError(error)
  }
}
