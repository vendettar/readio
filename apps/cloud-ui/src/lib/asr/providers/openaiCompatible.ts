import { FetchError, fetchWithFallback } from '../../fetchUtils'
import { debug } from '../../logger'
import type { ASRProviderConfig } from '../registry'
import { ASRClientError, type ASRCue, type ASRTranscriptionResult, type ASRWord } from '../types'

type OpenAiCompatibleWord = {
  word?: unknown
  start?: unknown
  end?: unknown
  probability?: unknown
  confidence?: unknown
}

type OpenAiCompatibleSegment = {
  text?: unknown
  start?: unknown
  end?: unknown
  words?: unknown
}

type OpenAiCompatibleVerboseJsonResponse = {
  text?: unknown
  language?: unknown
  duration?: unknown
  segments?: unknown
  x_groq?: unknown
}

type ParsedOpenAiVerboseJson = {
  cues: ASRCue[]
  segmentDerivedCues: ASRCue[]
}

const SUPPORTED_ASR_EXTENSIONS = ['wav', 'flac', 'ogg', 'webm', 'mp4', 'm4a', 'mp3'] as const

/**
 * Derives a safe filename extension for ASR providers.
 * Most OpenAI-compatible providers (Groq, etc.) use the extension to hint at the format.
 */
function getSafeAudioExtension(mimeType: string | undefined): string {
  if (!mimeType) return 'mp3'
  const lowMime = mimeType.toLowerCase()

  // 1. Direct check in supported list
  for (const ext of SUPPORTED_ASR_EXTENSIONS) {
    if (lowMime.includes(ext)) return ext
  }

  // 2. Specialized fallbacks
  if (lowMime.includes('mpeg')) return 'mp3'
  if (lowMime.includes('wave')) return 'wav'

  return 'mp3'
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  return null
}

function parseWord(item: unknown): ASRWord | null {
  if (!item || typeof item !== 'object') return null
  const row = item as OpenAiCompatibleWord
  const word = typeof row.word === 'string' ? row.word.trim() : ''
  const start = parseFiniteNumber(row.start)
  const end = parseFiniteNumber(row.end)
  if (!word || start === null || end === null) return null

  const confidenceValue = parseFiniteNumber(row.confidence ?? row.probability)
  return {
    word,
    start,
    end,
    ...(confidenceValue !== null ? { confidence: confidenceValue } : {}),
  }
}

function parseSegment(item: unknown): ASRCue | null {
  if (!item || typeof item !== 'object') return null
  const row = item as OpenAiCompatibleSegment

  const text = typeof row.text === 'string' ? row.text.trim() : ''
  const start = parseFiniteNumber(row.start)
  const end = parseFiniteNumber(row.end)
  if (!text || start === null || end === null) return null

  const words = Array.isArray(row.words)
    ? row.words.map(parseWord).filter((word): word is ASRWord => word !== null)
    : []

  return {
    start,
    end,
    text,
    ...(words.length > 0 ? { words } : {}),
  }
}

function mapStatusToError(
  status: number,
  message: string,
  retryAfterMs?: number,
  rateLimitKind?: 'asph' | 'generic' | null
): ASRClientError {
  if (status === 401) return new ASRClientError(message, 'unauthorized', status)
  if (status === 413) return new ASRClientError(message, 'payload_too_large', status)
  if (status === 429)
    return new ASRClientError(message, 'rate_limited', status, retryAfterMs, rateLimitKind)
  if (status >= 500)
    return new ASRClientError(message, 'service_unavailable', status, retryAfterMs, rateLimitKind)
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

export function mapOpenAiVerboseJsonToCues(payload: OpenAiCompatibleVerboseJsonResponse): ASRCue[] {
  return parseOpenAiVerboseJson(payload).cues
}

function parseOpenAiVerboseJson(
  payload: OpenAiCompatibleVerboseJsonResponse
): ParsedOpenAiVerboseJson {
  const segments = Array.isArray(payload.segments) ? payload.segments : []
  const parsedSegments = segments.map(parseSegment).filter((cue): cue is ASRCue => cue !== null)
  if (parsedSegments.length > 0) {
    return { cues: parsedSegments, segmentDerivedCues: parsedSegments }
  }

  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text) {
    return { cues: [], segmentDerivedCues: [] }
  }

  const duration = parseFiniteNumber(payload.duration)
  return {
    cues: [
      {
        start: 0,
        end: duration && duration > 0 ? duration : 2,
        text,
      },
    ],
    segmentDerivedCues: [],
  }
}

function resolveDurationSeconds(
  payload: OpenAiCompatibleVerboseJsonResponse,
  parsed: ParsedOpenAiVerboseJson
): number | undefined {
  const payloadDuration = parseFiniteNumber(payload.duration)
  if (payloadDuration !== null) return payloadDuration

  const lastSegmentCue = parsed.segmentDerivedCues[parsed.segmentDerivedCues.length - 1]
  return lastSegmentCue?.end
}

function getGroqRequestId(payload: OpenAiCompatibleVerboseJsonResponse): string | null {
  if (!payload.x_groq || typeof payload.x_groq !== 'object') return null
  const xGroq = payload.x_groq as { id?: unknown }
  if (typeof xGroq.id !== 'string') return null
  const trimmed = xGroq.id.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function extractRetryAfterMs(
  response: Response,
  text: string
): { retryAfterMs?: number; rateLimitKind: 'asph' | 'generic' | null } {
  let retryAfterMs: number | undefined
  let rateLimitKind: 'asph' | 'generic' | null = null

  // 1. Parse Retry-After header if present
  const retryAfterHeader = response.headers.get('retry-after')
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!Number.isNaN(seconds)) {
      retryAfterMs = seconds * 1000
    } else {
      // Try parsing as HTTP-date
      const date = new Date(retryAfterHeader)
      if (!Number.isNaN(date.getTime())) {
        retryAfterMs = Math.max(0, date.getTime() - Date.now())
      }
    }
  }

  const lowerText = text.toLowerCase()

  // 2. Try parsing "Please try again in X.Xs" from text
  if (retryAfterMs === undefined && lowerText.includes('try again in')) {
    const match = lowerText.match(/try again in ([\d.]+)s/i)
    if (match?.[1]) {
      const seconds = parseFloat(match[1])
      if (!Number.isNaN(seconds)) {
        retryAfterMs = seconds * 1000
      }
    }
  }

  // 3. Special case Groq ASPH exhaustion
  if (response.status === 429 && lowerText.includes('limit (asph)')) {
    rateLimitKind = 'asph'
    // ASPH exhausts the hourly limit, fallback to 61 mins if no explicit retryAfter was parsed or if it parsed something small
    if (!retryAfterMs || retryAfterMs < 60 * 60 * 1000) {
      retryAfterMs = 61 * 60 * 1000
    }
  } else if (response.status === 429) {
    rateLimitKind = 'generic'
  }

  return { retryAfterMs, rateLimitKind }
}

interface TranscribeWithOpenAiCompatibleOptions {
  blob: Blob
  apiKey: string
  model: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

export async function transcribeWithOpenAiCompatible({
  blob,
  apiKey,
  model,
  providerConfig,
  signal,
}: TranscribeWithOpenAiCompatibleOptions): Promise<ASRTranscriptionResult> {
  if (!apiKey.trim()) {
    throw new ASRClientError(`Missing ${providerConfig.label} API key`, 'unauthorized', 401)
  }

  const formData = new FormData()
  const extension = getSafeAudioExtension(blob.type)
  formData.append('file', blob, `input.${extension}`)
  formData.append('model', model)
  formData.append('response_format', providerConfig.responseFormat)
  formData.append('temperature', '0')
  if (providerConfig.id === 'groq') {
    formData.append('timestamp_granularities[]', 'segment')
    formData.append('timestamp_granularities[]', 'word')
  }

  let response: Response
  try {
    response = await fetch(providerConfig.transcribeEndpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal,
    })
  } catch (error) {
    throw mapFetchErrorToAsrError(error)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const { retryAfterMs, rateLimitKind } = extractRetryAfterMs(response, text)

    throw mapStatusToError(
      response.status,
      text || `${providerConfig.label} transcribe failed with ${response.status}`,
      retryAfterMs,
      rateLimitKind
    )
  }

  let payload: OpenAiCompatibleVerboseJsonResponse
  try {
    payload = (await response.json()) as OpenAiCompatibleVerboseJsonResponse
  } catch {
    throw new ASRClientError(
      `Invalid ${providerConfig.label} response payload`,
      'service_unavailable'
    )
  }

  const parsed = parseOpenAiVerboseJson(payload)
  const groqRequestId = getGroqRequestId(payload)
  if (providerConfig.id === 'groq' && groqRequestId) {
    debug('[ASR] Groq Request ID', {
      requestId: groqRequestId,
      provider: providerConfig.id,
      model,
    })
  }

  return {
    cues: parsed.cues,
    language: typeof payload.language === 'string' ? payload.language : undefined,
    durationSeconds: resolveDurationSeconds(payload, parsed),
    provider: providerConfig.id,
    model,
  }
}

interface VerifyOpenAiCompatibleKeyOptions {
  apiKey: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

export async function verifyOpenAiCompatibleKey({
  apiKey,
  providerConfig,
  signal,
}: VerifyOpenAiCompatibleKeyOptions): Promise<boolean> {
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
