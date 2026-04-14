import { FetchError, fetchWithFallback } from '../../fetchUtils'
import type { ASRProviderConfig } from '../registry'
import { ASRClientError, type ASRCue, type ASRTranscriptionResult, type ASRWord } from '../types'
import { extractRetryAfterMs } from './openaiCompatible'

type DeepgramWord = {
  word?: unknown
  start?: unknown
  end?: unknown
  confidence?: unknown
}

type DeepgramAlternative = {
  transcript?: unknown
  words?: unknown
  paragraphs?: unknown
}

type DeepgramSentence = {
  text?: unknown
  start?: unknown
  end?: unknown
}

type DeepgramParagraph = {
  sentences?: unknown
}

type DeepgramParagraphs = {
  paragraphs?: unknown
}

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: DeepgramAlternative[]
    }>
  }
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

function buildDeepgramUrl(endpoint: string, model: string): string {
  const url = new URL(endpoint)
  url.searchParams.set('model', model)
  url.searchParams.set('smart_format', 'true')
  url.searchParams.set('punctuate', 'true')
  url.searchParams.set('paragraphs', 'true')
  url.searchParams.set('diarize', 'false')
  return url.toString()
}

function parseDeepgramWord(item: unknown): ASRWord | null {
  if (!item || typeof item !== 'object') return null
  const row = item as DeepgramWord
  const word = typeof row.word === 'string' ? row.word.trim() : ''
  const start = parseFiniteNumber(row.start)
  const end = parseFiniteNumber(row.end)
  if (!word || start === null || end === null) return null

  const confidence = parseFiniteNumber(row.confidence)
  return {
    word,
    start,
    end,
    ...(confidence !== null ? { confidence } : {}),
  }
}

function parseDeepgramSentence(item: unknown): ASRCue | null {
  if (!item || typeof item !== 'object') return null
  const row = item as DeepgramSentence
  const text = typeof row.text === 'string' ? row.text.trim() : ''
  const start = parseFiniteNumber(row.start)
  const end = parseFiniteNumber(row.end)
  if (!text || start === null || end === null || end < start) return null
  return { start, end, text }
}

function parseDeepgramSentenceCues(alternative: DeepgramAlternative | undefined): ASRCue[] {
  if (!alternative || typeof alternative !== 'object') return []
  const paragraphsRaw =
    alternative.paragraphs && typeof alternative.paragraphs === 'object'
      ? (alternative.paragraphs as DeepgramParagraphs).paragraphs
      : undefined
  if (!Array.isArray(paragraphsRaw)) return []

  const cues: ASRCue[] = []
  for (const paragraph of paragraphsRaw) {
    if (!paragraph || typeof paragraph !== 'object') continue
    const sentencesRaw = (paragraph as DeepgramParagraph).sentences
    if (!Array.isArray(sentencesRaw)) continue
    for (const sentence of sentencesRaw) {
      const cue = parseDeepgramSentence(sentence)
      if (cue) cues.push(cue)
    }
  }
  return cues
}

function parseDeepgramAlternative(payload: DeepgramResponse): {
  transcript: string
  words: ASRWord[]
  sentenceCues: ASRCue[]
} {
  const alternative = payload.results?.channels?.[0]?.alternatives?.[0]
  const transcript =
    typeof alternative?.transcript === 'string' ? alternative.transcript.trim() : ''
  const words = Array.isArray(alternative?.words)
    ? alternative.words.map(parseDeepgramWord).filter((word): word is ASRWord => word !== null)
    : []
  const sentenceCues = parseDeepgramSentenceCues(alternative)

  return { transcript, words, sentenceCues }
}

interface TranscribeWithDeepgramOptions {
  blob: Blob
  apiKey: string
  model: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

export async function transcribeWithDeepgram({
  blob,
  apiKey,
  model,
  providerConfig,
  signal,
}: TranscribeWithDeepgramOptions): Promise<ASRTranscriptionResult> {
  if (!apiKey.trim()) {
    throw new ASRClientError(`Missing ${providerConfig.label} API key`, 'unauthorized', 401)
  }

  const contentType = blob.type.trim() || 'audio/mpeg'

  let response: Response
  try {
    response = await fetch(buildDeepgramUrl(providerConfig.transcribeEndpoint, model), {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': contentType,
      },
      body: blob,
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

  let payload: DeepgramResponse
  try {
    payload = (await response.json()) as DeepgramResponse
  } catch {
    throw new ASRClientError(
      `Invalid ${providerConfig.label} response payload`,
      'service_unavailable'
    )
  }

  const { transcript, words, sentenceCues } = parseDeepgramAlternative(payload)
  if (sentenceCues.length > 0) {
    const lastCue = sentenceCues[sentenceCues.length - 1]
    return {
      cues: sentenceCues,
      durationSeconds: lastCue.end,
      provider: providerConfig.id,
      model,
    }
  }

  if (words.length > 0) {
    const firstWord = words[0]
    const lastWord = words[words.length - 1]
    const fallbackText = words.map((word) => word.word).join(' ')
    const cueText = transcript || fallbackText
    const cues: ASRCue[] = [{ start: firstWord.start, end: lastWord.end, text: cueText, words }]

    return {
      cues,
      durationSeconds: lastWord.end,
      provider: providerConfig.id,
      model,
    }
  }

  if (transcript) {
    return {
      cues: [{ start: 0, end: 0, text: transcript }],
      durationSeconds: undefined,
      provider: providerConfig.id,
      model,
    }
  }

  throw new ASRClientError('Deepgram returned empty transcript', 'service_unavailable')
}

interface VerifyDeepgramKeyOptions {
  apiKey: string
  providerConfig: ASRProviderConfig
  signal?: AbortSignal
}

export async function verifyDeepgramKey({
  apiKey,
  providerConfig,
  signal,
}: VerifyDeepgramKeyOptions): Promise<boolean> {
  if (!apiKey.trim()) return false

  try {
    await fetchWithFallback<Response>(providerConfig.verifyEndpoint, {
      method: 'GET',
      raw: true,
      skipProxyOn4xx: true,
      purpose: 'ASR-Verify',
      headers: { Authorization: `Token ${apiKey}` },
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
