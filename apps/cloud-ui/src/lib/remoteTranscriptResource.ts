import { CLOUD_BACKEND_FALLBACK_CLASSES, fetchTextWithFallback } from './fetchUtils'
import { log } from './logger'
import { normalizePodcastAudioUrl } from './networking/urlUtils'
import { PlaybackRepository } from './repositories/PlaybackRepository'
import { abortRequestsWithPrefix, deduplicatedFetch, isRequestInflight } from './requestManager'
import { parseSubtitles } from './subtitles'
import type { ASRCue } from './asr/types'

export const REMOTE_TRANSCRIPT_READ_STATUS = {
  FRESH: 'fresh',
  STALE: 'stale',
  MISS: 'miss',
} as const

export type RemoteTranscriptReadStatus =
  (typeof REMOTE_TRANSCRIPT_READ_STATUS)[keyof typeof REMOTE_TRANSCRIPT_READ_STATUS]

export const REMOTE_TRANSCRIPT_FORMAT = {
  SRT: 'srt',
  VTT: 'vtt',
  JSON: 'json',
  TIMESTAMPED_TEXT: 'timestamped_text',
} as const

export type RemoteTranscriptFormat =
  (typeof REMOTE_TRANSCRIPT_FORMAT)[keyof typeof REMOTE_TRANSCRIPT_FORMAT]

export interface RemoteTranscriptParseSuccess {
  ok: true
  cues: ASRCue[]
}

export interface RemoteTranscriptParseFailure {
  ok: false
  reason: 'empty' | 'unsupported' | 'invalid'
}

export type RemoteTranscriptParseResult =
  | RemoteTranscriptParseSuccess
  | RemoteTranscriptParseFailure

export interface RemoteTranscriptLoadResult {
  ok: boolean
  status: RemoteTranscriptReadStatus
  source: 'cache' | 'network' | 'none'
  cues: ASRCue[]
  reason?: 'empty' | 'unsupported' | 'invalid' | 'network'
}

const REMOTE_TRANSCRIPT_TTL_MS = 24 * 60 * 60 * 1000
const REMOTE_TRANSCRIPT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const REMOTE_TRANSCRIPT_MAX_ENTRIES = 300

interface MemoryTranscriptEntry {
  cues: ASRCue[]
  fetchedAt: number
}

const memoryTranscriptCache = new Map<string, MemoryTranscriptEntry>()

export function normalizeTranscriptUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  try {
    const parsed = new URL(trimmed)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return trimmed
  }
}

export function getValidTranscriptUrl(url?: string | null): string | null {
  if (typeof url !== 'string') return null
  const normalizedUrl = normalizeTranscriptUrl(url)
  if (!normalizedUrl) return null
  if (normalizedUrl.startsWith('//') || normalizedUrl.startsWith('/')) {
    try {
      return new URL(normalizedUrl, window.location.origin).toString()
    } catch {
      return null
    }
  }
  try {
    const parsed = new URL(normalizedUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

export function deriveRemoteTranscriptCacheId(url: string): string {
  return `remote-transcript:${normalizeTranscriptUrl(url)}`
}

function copyCues(cues: ASRCue[]): ASRCue[] {
  return cues.map((cue) => ({
    start: cue.start,
    end: cue.end,
    text: cue.text,
    words: cue.words ? [...cue.words] : undefined,
    speakerId: cue.speakerId,
  }))
}

function getCacheStatusByFetchedAt(fetchedAt: number): RemoteTranscriptReadStatus {
  const ageMs = Date.now() - fetchedAt
  return ageMs <= REMOTE_TRANSCRIPT_TTL_MS ? 'fresh' : 'stale'
}

function pruneMemoryTranscriptCache(): void {
  if (memoryTranscriptCache.size <= REMOTE_TRANSCRIPT_MAX_ENTRIES) return
  const oldestKey = memoryTranscriptCache.keys().next().value
  if (oldestKey) {
    memoryTranscriptCache.delete(oldestKey)
  }
}

function setMemoryTranscriptCache(url: string, cues: ASRCue[], fetchedAt: number): void {
  const normalizedUrl = normalizeTranscriptUrl(url)
  if (!normalizedUrl || cues.length === 0) return
  memoryTranscriptCache.set(normalizedUrl, {
    cues: copyCues(cues),
    fetchedAt,
  })
  pruneMemoryTranscriptCache()
}

function readMemoryTranscriptCache(url: string): {
  status: RemoteTranscriptReadStatus
  cues: ASRCue[]
  entryFetchedAt?: number
} {
  const normalizedUrl = normalizeTranscriptUrl(url)
  if (!normalizedUrl) return { status: 'miss', cues: [] }

  const memoryHit = memoryTranscriptCache.get(normalizedUrl)
  if (!memoryHit) return { status: 'miss', cues: [] }

  return {
    status: getCacheStatusByFetchedAt(memoryHit.fetchedAt),
    cues: copyCues(memoryHit.cues),
    entryFetchedAt: memoryHit.fetchedAt,
  }
}

function normalizeCueRange(cues: ASRCue[]): ASRCue[] {
  if (cues.length === 0) return []
  const sorted = [...cues].sort((a, b) => a.start - b.start)
  return sorted
    .map((cue, index) => {
      const next = sorted[index + 1]
      const safeStart = Math.max(0, cue.start)
      const fallbackEnd = next ? Math.max(next.start, safeStart + 0.5) : safeStart + 2
      const safeEnd = cue.end > safeStart ? cue.end : fallbackEnd
      return { ...cue, start: safeStart, end: safeEnd, text: cue.text.trim() }
    })
    .filter((cue) => cue.text.length > 0)
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return numeric

  const normalized = raw.replace(',', '.')
  const match = normalized.match(/^(?:(\d+):)?(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,3}))?$/)
  if (match) {
    const hasHours = match[2] !== undefined
    const hours = Number(hasHours ? match[1] || 0 : 0)
    const minutes = Number(hasHours ? match[2] || 0 : match[1] || 0)
    const seconds = Number(match[3] || 0)
    const ms = Number((match[4] || '0').padEnd(3, '0'))
    return hours * 3600 + minutes * 60 + seconds + ms / 1000
  }

  const iso = raw.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i)
  if (iso) {
    const hours = Number(iso[1] || 0)
    const minutes = Number(iso[2] || 0)
    const seconds = Number(iso[3] || 0)
    return hours * 3600 + minutes * 60 + seconds
  }

  return null
}

function extractCueArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json
  if (!json || typeof json !== 'object') return []

  const obj = json as Record<string, unknown>
  const directCandidates = ['cues', 'segments', 'items', 'results', 'entries', 'transcript']
  for (const key of directCandidates) {
    const value = obj[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const nested = value as Record<string, unknown>
      for (const nestedKey of directCandidates) {
        if (Array.isArray(nested[nestedKey])) {
          return nested[nestedKey] as unknown[]
        }
      }
    }
  }

  return []
}

function parsePodcastTranscriptJson(content: string): ASRCue[] {
  const parsed = JSON.parse(content) as unknown
  const rows = extractCueArray(parsed)
  const cues: ASRCue[] = []

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const textValue =
      item.text ?? item.body ?? item.value ?? item.transcript ?? item.caption ?? item.line
    const text = typeof textValue === 'string' ? textValue.trim() : ''
    if (!text) continue

    const start =
      parseTimestamp(
        item.start ??
          item.startTime ??
          item.start_time ??
          item.begin ??
          item.offset ??
          item.time ??
          item.ts
      ) ?? null
    if (start === null) continue

    const endFromField = parseTimestamp(item.end ?? item.endTime ?? item.end_time ?? item.stop)
    const duration = parseTimestamp(item.duration)
    const end = endFromField ?? (duration !== null ? start + duration : start + 2)

    cues.push({ start, end, text })
  }

  return normalizeCueRange(cues)
}

const TIMESTAMPED_TEXT_TOKEN = '(?:\\d+:)?\\d{1,2}:\\d{2}(?:[.,]\\d{1,3})?'
const TIMESTAMPED_TEXT_ONLY_RE = new RegExp(
  `^(?:\\[(?<timeBracketed>${TIMESTAMPED_TEXT_TOKEN})\\]|(?<timeBare>${TIMESTAMPED_TEXT_TOKEN}))$`
)
const TIMESTAMPED_TEXT_INLINE_RE = new RegExp(
  `^(?:\\[(?<timeBracketed>${TIMESTAMPED_TEXT_TOKEN})\\]|(?<timeBare>${TIMESTAMPED_TEXT_TOKEN}))(?:\\s*[-–—:]\\s*|\\s+)(?<text>\\S.*)$`
)

function parseTimestampedTextTranscript(content: string): ASRCue[] {
  const cues: ASRCue[] = []
  const lines = content
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
  let pendingStart: number | null = null
  let pendingTextLines: string[] = []

  const flushPending = () => {
    if (pendingStart === null || pendingTextLines.length === 0) {
      pendingStart = null
      pendingTextLines = []
      return
    }

    cues.push({
      start: pendingStart,
      end: pendingStart,
      text: pendingTextLines.join(' ').trim(),
    })
    pendingStart = null
    pendingTextLines = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const timestampOnlyMatch = line.match(TIMESTAMPED_TEXT_ONLY_RE)
    if (timestampOnlyMatch?.groups) {
      flushPending()
      pendingStart = parseTimestamp(
        timestampOnlyMatch.groups.timeBracketed ?? timestampOnlyMatch.groups.timeBare
      )
      pendingTextLines = []
      continue
    }

    const inlineMatch = line.match(TIMESTAMPED_TEXT_INLINE_RE)
    if (inlineMatch?.groups) {
      flushPending()
      const start = parseTimestamp(inlineMatch.groups.timeBracketed ?? inlineMatch.groups.timeBare)
      const text = inlineMatch.groups.text.trim()
      if (start !== null && text) {
        cues.push({
          start,
          end: start,
          text,
        })
      }
      continue
    }

    if (pendingStart !== null) {
      pendingTextLines.push(line)
    }
  }

  flushPending()
  return normalizeCueRange(cues)
}

function detectTranscriptFormat(url: string, content: string): RemoteTranscriptFormat | null {
  const loweredUrl = url.toLowerCase()
  const trimmed = content.trimStart()
  const timestampedTextLines = trimmed
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => TIMESTAMPED_TEXT_ONLY_RE.test(line) || TIMESTAMPED_TEXT_INLINE_RE.test(line))

  if (loweredUrl.includes('format=textwithtimestamps') && timestampedTextLines.length >= 1) {
    return 'timestamped_text'
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || loweredUrl.endsWith('.json')) {
    return 'json'
  }
  if (trimmed.startsWith('WEBVTT') || loweredUrl.endsWith('.vtt')) {
    return 'vtt'
  }
  if (trimmed.includes('-->')) {
    return loweredUrl.endsWith('.vtt') ? 'vtt' : 'srt'
  }
  if (timestampedTextLines.length >= 2) {
    return 'timestamped_text'
  }
  return null
}

export function parseRemoteTranscriptContent(
  url: string,
  content: string
): RemoteTranscriptParseResult {
  const normalized = String(content || '').trim()
  if (!normalized) {
    return { ok: false, reason: 'empty' }
  }

  const detectedFormat = detectTranscriptFormat(url, normalized)
  if (!detectedFormat) {
    return { ok: false, reason: 'unsupported' }
  }

  try {
    const cues =
      detectedFormat === 'json'
        ? parsePodcastTranscriptJson(normalized)
        : detectedFormat === 'timestamped_text'
          ? parseTimestampedTextTranscript(normalized)
          : parseSubtitles(normalized)
    if (cues.length === 0) {
      return { ok: false, reason: 'invalid' }
    }
    return { ok: true, cues: normalizeCueRange(cues) }
  } catch (error) {
    log('[remoteTranscript] parse failed', error)
    return { ok: false, reason: 'invalid' }
  }
}

export async function readRemoteTranscriptCache(url: string): Promise<{
  status: RemoteTranscriptReadStatus
  cues: ASRCue[]
  entryFetchedAt?: number
}> {
  const normalizedUrl = normalizeTranscriptUrl(url)
  if (!normalizedUrl) return { status: 'miss', cues: [] }

  const memoryCached = readMemoryTranscriptCache(normalizedUrl)
  if (memoryCached.status === 'fresh') {
    return memoryCached
  }

  const staleMemoryFallback = memoryCached.status === 'stale' ? memoryCached : null

  const cached = await PlaybackRepository.getRemoteTranscriptByUrl(normalizedUrl)
  if (!cached) {
    return staleMemoryFallback ?? { status: 'miss', cues: [] }
  }

  setMemoryTranscriptCache(normalizedUrl, cached.cues, cached.fetchedAt)

  const dbCached = {
    status: getCacheStatusByFetchedAt(cached.fetchedAt),
    cues: cached.cues,
    entryFetchedAt: cached.fetchedAt,
  }

  if (
    staleMemoryFallback?.entryFetchedAt &&
    staleMemoryFallback.entryFetchedAt > cached.fetchedAt
  ) {
    return staleMemoryFallback
  }

  return dbCached
}

async function fetchAndPersistRemoteTranscript(
  url: string,
  signal?: AbortSignal
): Promise<{
  ok: boolean
  cues: ASRCue[]
  reason?: 'empty' | 'unsupported' | 'invalid' | 'network'
}> {
  try {
    const content = await fetchTextWithFallback(url, {
      signal,
      expectXml: false,
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.TRANSCRIPT,
    })
    const parsed = parseRemoteTranscriptContent(url, content)
    if (!parsed.ok) {
      log('[remoteTranscript] parse unsupported/invalid', { url, reason: parsed.reason })
      return { ok: false, cues: [], reason: parsed.reason }
    }

    await persistRemoteTranscriptRecord({
      url,
      cues: parsed.cues,
      source: 'podcast-transcript',
    })

    return { ok: true, cues: parsed.cues }
  } catch (error) {
    log('[remoteTranscript] fetch failed', error)
    return { ok: false, cues: [], reason: 'network' }
  }
}

function scheduleRevalidation(url: string): void {
  const normalized = normalizeTranscriptUrl(url)
  if (!normalized || isRequestInflight(`revalidate:${normalized}`)) return

  void deduplicatedFetch(`revalidate:${normalized}`, async () => {
    try {
      await fetchAndPersistRemoteTranscript(normalized)
    } catch {
      // Background revalidation failures are silent
    }
  })
}

export async function loadRemoteTranscriptWithCache(
  url: string,
  signal?: AbortSignal
): Promise<RemoteTranscriptLoadResult> {
  const normalized = normalizeTranscriptUrl(url)
  if (!normalized) {
    return { ok: false, status: 'miss', source: 'none', cues: [], reason: 'invalid' }
  }

  const cached = await readRemoteTranscriptCache(normalized)
  if (cached.status === 'fresh') {
    return { ok: true, status: 'fresh', source: 'cache', cues: cached.cues }
  }

  if (cached.status === 'stale') {
    scheduleRevalidation(normalized)
    return { ok: true, status: 'stale', source: 'cache', cues: cached.cues }
  }

  const network = await fetchAndPersistRemoteTranscript(normalized, signal)
  if (!network.ok) {
    return {
      ok: false,
      status: 'miss',
      source: 'network',
      cues: [],
      reason: network.reason,
    }
  }

  return { ok: true, status: 'miss', source: 'network', cues: network.cues }
}

export async function persistRemoteTranscriptRecord(input: {
  url: string
  cues: ASRCue[]
  source: string
  asrFingerprint?: string
  fetchedAt?: number
}): Promise<void> {
  const normalizedUrl = normalizeTranscriptUrl(input.url)
  if (!normalizedUrl || input.cues.length === 0) return

  const fetchedAt = input.fetchedAt ?? Date.now()
  await PlaybackRepository.upsertRemoteTranscript({
    id: deriveRemoteTranscriptCacheId(normalizedUrl),
    url: normalizedUrl,
    cues: input.cues,
    cueSchemaVersion: 1,
    asrFingerprint: input.asrFingerprint,
    fetchedAt,
    cueCount: input.cues.length,
    source: input.source,
  })
  setMemoryTranscriptCache(normalizedUrl, input.cues, fetchedAt)
  await PlaybackRepository.pruneRemoteTranscripts(
    REMOTE_TRANSCRIPT_MAX_ENTRIES,
    REMOTE_TRANSCRIPT_MAX_AGE_MS
  )
}

export async function runRemoteTranscriptCacheMaintenance(): Promise<void> {
  await PlaybackRepository.pruneRemoteTranscripts(
    REMOTE_TRANSCRIPT_MAX_ENTRIES,
    REMOTE_TRANSCRIPT_MAX_AGE_MS
  )
}

export function __resetRemoteTranscriptResourceStateForTests(): void {
  abortRequestsWithPrefix('revalidate:')
  memoryTranscriptCache.clear()
}

export const normalizeAsrAudioUrl = normalizePodcastAudioUrl
