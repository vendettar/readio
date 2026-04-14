import { type EpisodeMetadata, usePlayerStore } from '../store/playerStore'
import {
  TRANSCRIPT_INGESTION_STATUS,
  type TranscriptIngestionStatus,
  useTranscriptStore,
} from '../store/transcriptStore'
import { ASRClientError, type ASRProvider, transcribeAudioWithRetry } from './asr'
import { backgroundAsrQueue } from './asr/queue'
import {
  type AsrConfigErrorCode,
  resolveAsrEffectiveModel,
  validateAsrProviderModelSelection,
} from './asr/registry'
import type { ASRCue } from './asr/types'
import { getAsrCredentialKey, getCredential } from './db/credentialsRepository'
import { isPodcastDownloadTrack, isUserUploadTrack } from './db/types'
import { DB } from './dexieDb'
import { persistAudioBlobAsDownload } from './downloadService'
import {
  CLOUD_BACKEND_FALLBACK_CLASSES,
  FetchError,
  fetchTextWithFallback,
  fetchWithFallback,
  isAbortLikeError,
} from './fetchUtils'
import { log, logError, warn } from './logger'
import { normalizePodcastAudioUrl, sha256, unwrapPodcastTrackingUrl } from './networking/urlUtils'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { FilesRepository } from './repositories/FilesRepository'
import { abortRequestsWithPrefix, deduplicatedFetch, isRequestInflight } from './requestManager'
import { normalizeCountryParam } from './routes/podcastRoutes'
import { DEFAULTS } from './runtimeConfig.defaults'
import { getSettingsSnapshot } from './schemas/settings'
import { parseSubtitles } from './subtitles'
import { toast } from './toast'

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

export class AudioDownloadError extends Error {
  code = 'audio_download_error' as const
  constructor(message: string) {
    super(message)
    this.name = 'AudioDownloadError'
  }
}

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
const ASR_LOCAL_SUBTITLE_PREFIX = 'ASR'

interface AsrSettingsSnapshot {
  asrProvider: ASRProvider | ''
  asrModel: string
}

type OnlineAsrTrigger = 'auto' | 'manual'

export const RETRANSCRIBE_DOWNLOAD_REASON = {
  SUCCESS: 'success',
  TRACK_NOT_FOUND: 'track_not_found',
  INVALID_SOURCE: 'invalid_source',
  UNCONFIGURED: 'unconfigured',
  IN_FLIGHT: 'in_flight',
  FAILED: 'failed',
  ENQUEUE_FAILED: 'enqueue_failed',
} as const

export type RetranscribeDownloadReason =
  (typeof RETRANSCRIBE_DOWNLOAD_REASON)[keyof typeof RETRANSCRIBE_DOWNLOAD_REASON]

export interface RetranscribeDownloadResult {
  ok: boolean
  reason: RetranscribeDownloadReason
  fileSubtitleId?: string
}

export const RETRANSCRIBE_FILE_REASON = {
  SUCCESS: 'success',
  TRACK_NOT_FOUND: 'track_not_found',
  INVALID_SOURCE: 'invalid_source',
  UNCONFIGURED: 'unconfigured',
  IN_FLIGHT: 'in_flight',
  FAILED: 'failed',
  ENQUEUE_FAILED: 'enqueue_failed',
} as const

export type RetranscribeFileReason =
  (typeof RETRANSCRIBE_FILE_REASON)[keyof typeof RETRANSCRIBE_FILE_REASON]

export interface RetranscribeFileResult {
  ok: boolean
  reason: RetranscribeFileReason
  fileSubtitleId?: string
}

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

export const normalizeAsrAudioUrl = normalizePodcastAudioUrl

export function getAsrSettingsSnapshot(): AsrSettingsSnapshot {
  const snapshot = getSettingsSnapshot()
  const effectiveModel = resolveAsrEffectiveModel(snapshot)
  return {
    asrProvider: snapshot.asrProvider as ASRProvider | '',
    asrModel: effectiveModel,
  }
}

function sanitizeFilenameSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatAsrSubtitleName(input: { episodeTitle: string; provider: string; model: string }): {
  subtitleName: string
  subtitleFilename: string
} {
  const episodeTitle = input.episodeTitle.trim() || ASR_LOCAL_SUBTITLE_PREFIX
  const provider = input.provider.trim() || 'asr'
  const model = input.model.trim() || 'model'
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const subtitleName = `${episodeTitle} - ${provider} - ${model} - ${timestamp}`
  const safeFilename = sanitizeFilenameSegment(subtitleName)
  return {
    subtitleName,
    subtitleFilename: `${safeFilename}.srt`,
  }
}

// parseRawAsrCues is no longer needed as primary path,
// using simple JSON.parse now that schema is unified.

function getPlayerStoreStateSafe(): ReturnType<typeof usePlayerStore.getState> | null {
  const store = usePlayerStore as typeof usePlayerStore & {
    getState?: () => ReturnType<typeof usePlayerStore.getState>
  }
  if (typeof store.getState !== 'function') return null
  return store.getState()
}

function isTrackStillCurrent(expectedAudioUrl: string, requestId: number): boolean {
  const current = getPlayerStoreStateSafe()
  if (!current) return false
  const identityUrl = resolveAsrIdentityUrl(current.audioUrl, current.episodeMetadata)
  return current.loadRequestId === requestId && identityUrl === expectedAudioUrl
}

/**
 * Resolves the stable identity URL for ASR (Identity Anchoring).
 * For downloaded episodes (blob:), returns the original remote URL.
 * For local files, returns the raw blob URL.
 */
export function resolveAsrIdentityUrl(
  audioUrl: string | null | undefined,
  metadata?: EpisodeMetadata | null
): string {
  if (!audioUrl) return ''
  return metadata?.originalAudioUrl || audioUrl
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

  const cached = await DB.getRemoteTranscriptByUrl(normalizedUrl)
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

    const normalizedUrl = normalizeTranscriptUrl(url)
    const fetchedAt = Date.now()
    await DB.upsertRemoteTranscript({
      id: deriveRemoteTranscriptCacheId(normalizedUrl),
      url: normalizedUrl,
      cues: parsed.cues,
      cueSchemaVersion: 1,
      fetchedAt,
      cueCount: parsed.cues.length,
      source: 'podcast-transcript',
    })
    await DB.pruneRemoteTranscripts(REMOTE_TRANSCRIPT_MAX_ENTRIES, REMOTE_TRANSCRIPT_MAX_AGE_MS)
    setMemoryTranscriptCache(normalizedUrl, parsed.cues, fetchedAt)

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

export async function runRemoteTranscriptCacheMaintenance(): Promise<void> {
  await DB.pruneRemoteTranscripts(REMOTE_TRANSCRIPT_MAX_ENTRIES, REMOTE_TRANSCRIPT_MAX_AGE_MS)
}

function clearAsrStateForTrack(
  expectedAudioUrl: string,
  requestId: number,
  status: typeof TRANSCRIPT_INGESTION_STATUS.IDLE | typeof TRANSCRIPT_INGESTION_STATUS.FAILED,
  error: { code: string; message: string } | null = null
): void {
  if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return

  if (!getPlayerStoreStateSafe()) return
  const ts = useTranscriptStore.getState()
  ts.setAbortAsrController(null)
  ts.setAsrActiveTrackKey(null)
  ts.setTranscriptIngestionError(error)
  ts.setTranscriptIngestionStatus(status)
}

function mapStatusToAsrError(status: number, message: string): ASRClientError {
  if (status === 401) return new ASRClientError(message, 'unauthorized', status)
  if (status === 413) return new ASRClientError(message, 'payload_too_large', status)
  if (status === 429) return new ASRClientError(message, 'rate_limited', status)
  if (status >= 500) return new ASRClientError(message, 'service_unavailable', status)
  return new ASRClientError(message, 'client_error', status)
}

async function resolveAsrApiKeyAndSettings(): Promise<
  | {
      ok: true
      asrProvider: ASRProvider
      asrModel: string
      apiKey: string
    }
  | {
      ok: false
      reasonCode?: AsrConfigErrorCode
    }
> {
  const settings = getAsrSettingsSnapshot()
  const selectionValidation = validateAsrProviderModelSelection({
    asrProvider: settings.asrProvider,
    asrModel: settings.asrModel,
  })
  if (!selectionValidation.ok) {
    return { ok: false, reasonCode: selectionValidation.code }
  }

  const apiKey = (await getCredential(getAsrCredentialKey(settings.asrProvider))).trim()
  if (!apiKey) return { ok: false }

  return {
    ok: true,
    asrProvider: selectionValidation.provider,
    asrModel: selectionValidation.model,
    apiKey,
  }
}

// Bypassing TanStack Router via pushState is brittle and can break with base path changes.
// We use a custom event to request navigation from the UI layer to avoid circular dependencies.
function navigateToSettingsAsrSection(): void {
  window.dispatchEvent(
    new CustomEvent('readio:navigate', {
      detail: { to: '/settings', hash: 'asr' },
    })
  )
}

function buildAsrTrackKey(expectedAudioUrl: string, localTrackId: string | null): string {
  if (localTrackId) return `local:${localTrackId}`
  return `podcast:${normalizeAsrAudioUrl(expectedAudioUrl)}`
}

async function fetchRemoteAudioBlob(audioUrl: string, signal?: AbortSignal): Promise<Blob> {
  const unwrappedUrl = unwrapPodcastTrackingUrl(audioUrl)
  try {
    const response = await fetchWithFallback<Response>(unwrappedUrl, {
      signal,
      raw: true,
      method: 'GET',
      purpose: 'ASR-Fetch',
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.ASR_AUDIO,
    })
    return await response.blob()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ASRClientError('ASR request aborted', 'aborted')
    }
    if (error instanceof FetchError) {
      throw mapStatusToAsrError(error.status ?? 0, error.message)
    }
    throw new AudioDownloadError(
      error instanceof Error ? error.message : 'Network error while downloading audio'
    )
  }
}

async function fetchTrackAudioBlob(
  expectedAudioUrl: string,
  localTrackId: string | null,
  signal?: AbortSignal
): Promise<Blob> {
  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    if (track) {
      const audioBlob = await DB.getAudioBlob(track.audioId)
      if (!audioBlob) {
        throw new ASRClientError('Missing local track audio blob', 'client_error')
      }
      return audioBlob.blob
    }
    throw new ASRClientError('Missing local track or download', 'client_error')
  }

  // Deduplication: Check if this remote podcast was already downloaded locally
  const { findDownloadedTrack } = await import('./downloadService')
  const downloadedMeta = await findDownloadedTrack(normalizeAsrAudioUrl(expectedAudioUrl))
  if (downloadedMeta?.audioId) {
    const audioBlob = await DB.getAudioBlob(downloadedMeta.audioId)
    if (audioBlob) {
      return audioBlob.blob
    }
  }

  return fetchRemoteAudioBlob(expectedAudioUrl, signal)
}

async function computeAsrFingerprint(options: {
  localTrackId: string | null
  audioBlob: Blob
  model: string
}): Promise<string> {
  const { localTrackId, audioBlob, model } = options
  let audioId = 'streaming'
  let downloadedAt = 0

  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    if (track) {
      audioId = track.audioId
      downloadedAt = isPodcastDownloadTrack(track) ? track.downloadedAt : track.createdAt
    }
  }

  // Fingerprint logic (Instruction 125)
  const raw = `${localTrackId ?? 'remote'}|${audioId}|${audioBlob.size}|${model || ''}|${downloadedAt}`
  return await sha256(raw)
}

async function tryApplyFingerprintCache(
  fingerprint: string,
  expectedAudioUrl: string,
  requestId: number
): Promise<boolean> {
  // 1. Check local subtitles first
  const localSubtitle = await DB.findSubtitleByFingerprint(fingerprint)
  if (localSubtitle && localSubtitle.cues.length > 0) {
    if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return false
    useTranscriptStore.getState().setSubtitles(localSubtitle.cues)
    return true
  }

  // 2. Check remote transcripts
  const remoteTranscript = await DB.findRemoteTranscriptByFingerprint(fingerprint)
  if (remoteTranscript && remoteTranscript.cues.length > 0) {
    if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return false
    useTranscriptStore.getState().setSubtitles(remoteTranscript.cues)
    return true
  }

  return false
}

export async function tryApplyCachedAsrTranscript(
  expectedAudioUrl: string,
  localTrackId: string | null,
  requestId: number
): Promise<boolean> {
  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    const readySubtitles = isUserUploadTrack(track)
      ? await FilesRepository.getReadySubtitlesByTrackId(localTrackId)
      : await DownloadsRepository.getReadySubtitlesByTrackId(localTrackId)

    for (const { subtitle } of readySubtitles) {
      if (subtitle.cues.length > 0 && isTrackStillCurrent(expectedAudioUrl, requestId)) {
        useTranscriptStore.getState().setSubtitles(subtitle.cues)
        return true
      }
    }
    return false
  }

  const normalizedAudioUrl = normalizeAsrAudioUrl(expectedAudioUrl)
  if (!normalizedAudioUrl) return false

  const cached = await DB.getRemoteTranscriptByUrl(normalizedAudioUrl)
  if (cached && cached.cues.length > 0 && isTrackStillCurrent(expectedAudioUrl, requestId)) {
    useTranscriptStore.getState().setSubtitles(cached.cues)
    return true
  }

  return false
}

export async function hasStoredTranscriptSource(
  expectedAudioUrl: string,
  localTrackId: string | null
): Promise<boolean> {
  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    const readySubtitles = isUserUploadTrack(track)
      ? await FilesRepository.getReadySubtitlesByTrackId(localTrackId)
      : await DownloadsRepository.getReadySubtitlesByTrackId(localTrackId)

    return readySubtitles.some(({ subtitle }) => subtitle.cues.length > 0)
  }

  const normalizedAudioUrl = normalizeAsrAudioUrl(expectedAudioUrl)
  if (!normalizedAudioUrl) return false

  const cached = await DB.getRemoteTranscriptByUrl(normalizedAudioUrl)
  return Boolean(cached && cached.cues.length > 0)
}

export async function persistImportedTranscriptForPlaybackIdentity(
  expectedAudioUrl: string,
  cues: ASRCue[]
): Promise<boolean> {
  const normalizedAudioUrl = normalizeAsrAudioUrl(expectedAudioUrl)
  if (!normalizedAudioUrl || cues.length === 0) return false

  const fetchedAt = Date.now()
  await DB.upsertRemoteTranscript({
    id: deriveRemoteTranscriptCacheId(normalizedAudioUrl),
    url: normalizedAudioUrl,
    cues,
    cueSchemaVersion: 1,
    fetchedAt,
    cueCount: cues.length,
    source: 'manual_upload',
  })
  setMemoryTranscriptCache(normalizedAudioUrl, cues, fetchedAt)
  await DB.pruneRemoteTranscripts(REMOTE_TRANSCRIPT_MAX_ENTRIES, REMOTE_TRANSCRIPT_MAX_AGE_MS)
  return true
}

async function persistAsrResult(options: {
  expectedAudioUrl: string
  localTrackId: string | null
  episodeTitle: string
  model: string
  provider: string
  cues: ASRCue[]
  taskStartedAt: number
  fingerprint?: string
}): Promise<void> {
  const {
    expectedAudioUrl,
    localTrackId,
    episodeTitle,
    model,
    provider,
    cues,
    taskStartedAt,
    fingerprint,
  } = options

  if (localTrackId) {
    const { subtitleFilename, subtitleName } = formatAsrSubtitleName({
      episodeTitle,
      provider,
      model,
    })
    const subtitleId = await DB.addSubtitle(cues, subtitleFilename, fingerprint)
    const now = Date.now()
    const fileSubtitleId = await DB.addFileSubtitle({
      trackId: localTrackId,
      subtitleId,
      name: subtitleName,
      sourceKind: 'asr_online',
      provider,
      model,
      createdAt: now,
      status: 'ready',
    })

    // Determine if this is a FileTrack or PodcastDownload
    const track = await FilesRepository.getTrackById(localTrackId)
    if (isUserUploadTrack(track)) {
      await FilesRepository.updateFileTrack(localTrackId, { activeSubtitleId: fileSubtitleId })
    } else if (isPodcastDownloadTrack(track)) {
      // Podcast download: respect manual pinnedAt concurrency contract (Instruction 125b)
      if (await DownloadsRepository.shouldAutoSetActive(localTrackId, taskStartedAt)) {
        await DownloadsRepository.setActiveSubtitle(localTrackId, fileSubtitleId, false)
      }
    }
    return
  }

  const normalizedAudioUrl = normalizeAsrAudioUrl(expectedAudioUrl)
  if (!normalizedAudioUrl) return

  const fetchedAt = Date.now()
  await DB.upsertRemoteTranscript({
    id: deriveRemoteTranscriptCacheId(normalizedAudioUrl),
    url: normalizedAudioUrl,
    cues,
    cueSchemaVersion: 1,
    asrFingerprint: fingerprint,
    fetchedAt,
    cueCount: cues.length,
    source: `asr-${provider}`,
  })
  setMemoryTranscriptCache(normalizedAudioUrl, cues, fetchedAt)
  await DB.pruneRemoteTranscripts(REMOTE_TRANSCRIPT_MAX_ENTRIES, REMOTE_TRANSCRIPT_MAX_AGE_MS)
}

function handleAsrFailure(
  error: unknown,
  _trigger: OnlineAsrTrigger
): { status: 'idle' | 'failed'; error: { code: string; message: string } | null } {
  if (error instanceof AudioDownloadError) {
    return {
      status: 'failed',
      error: { code: error.code, message: error.message },
    }
  }

  const asrError =
    error instanceof ASRClientError
      ? error
      : new ASRClientError('Unknown ASR failure', 'network_error')

  if (asrError.code === 'aborted') {
    log('[asr] aborted')
    return { status: 'idle', error: null }
  }

  // Map codes to user-friendly messages if needed, or use the error message
  const errorPayload = {
    code: asrError.code,
    message: asrError.message,
  }

  if (asrError.code === 'network_error') {
    log('[asr] network failure', asrError.message)
    return { status: 'failed', error: errorPayload }
  }

  if (asrError.code === 'unauthorized') {
    // Keep toast for unauthorized as it requires setting intervention
    toast.errorKey('asrKeyInvalid')
    navigateToSettingsAsrSection()
    return { status: 'failed', error: errorPayload }
  }

  // For other errors, we rely on the component UI to show the error
  // instead of spamming toasts
  log('[asr] task failed', asrError.code, asrError.message)

  return { status: 'failed', error: errorPayload }
}

const inFlightAsrTasks = new Set<string>()
const asrProviderCooldowns = new Map<ASRProvider, number>()

async function startOnlineASRForTrack(options: {
  expectedAudioUrl: string
  requestId: number
  localTrackId: string | null
  trigger: OnlineAsrTrigger
}): Promise<void> {
  const { expectedAudioUrl, requestId, localTrackId, trigger } = options
  const taskStartedAt = Date.now()

  // Deduplicate before queued tasks accumulate
  const trackKeyCheck = buildAsrTrackKey(expectedAudioUrl, localTrackId)
  if (inFlightAsrTasks.has(trackKeyCheck)) return
  inFlightAsrTasks.add(trackKeyCheck)

  let shouldEnqueue = false
  let asrConfig: Awaited<ReturnType<typeof resolveAsrApiKeyAndSettings>> = { ok: false }

  try {
    // 1. Initial Quick Checks
    if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return

    asrConfig = await resolveAsrApiKeyAndSettings()
    if (!asrConfig.ok) {
      const status =
        trigger === 'auto' ? TRANSCRIPT_INGESTION_STATUS.IDLE : TRANSCRIPT_INGESTION_STATUS.FAILED
      clearAsrStateForTrack(
        expectedAudioUrl,
        requestId,
        status,
        trigger === 'auto'
          ? undefined
          : {
              code: asrConfig.reasonCode ?? 'unconfigured',
              message: asrConfig.reasonCode ?? 'Missing ASR Provider or Model',
            }
      )
      return
    }

    // 2. Try Exact URL match cache
    if (await tryApplyCachedAsrTranscript(expectedAudioUrl, localTrackId, requestId)) {
      clearAsrStateForTrack(expectedAudioUrl, requestId, TRANSCRIPT_INGESTION_STATUS.IDLE)
      return
    }

    shouldEnqueue = true
  } finally {
    // If we return early before enqueueing, we MUST release the flight lock
    if (!shouldEnqueue) {
      inFlightAsrTasks.delete(trackKeyCheck)
    }
  }

  // 3. Enqueue Global FIFO ASR Task (Instruction 125)
  // At this point shouldEnqueue is true and we hand off the flight lock to the task
  const task = async () => {
    try {
      if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return

      let activeController: AbortController | null = null
      const trackKey = trackKeyCheck // Use the same key

      try {
        const ts = useTranscriptStore.getState()
        if (ts.transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING) {
          if (ts.asrActiveTrackKey === trackKey) return
          ts.abortAsrController?.abort()
        }

        const controller = new AbortController()
        activeController = controller
        ts.setAsrActiveTrackKey(trackKey)
        ts.setAbortAsrController(controller)
        ts.setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.LOADING)

        log('[asr] starting sequential task', { trackKey, trigger })

        if (!asrConfig.ok) throw new Error('Missing asr runtime config')

        // Check provider cooldown
        const cooldownUntil = asrProviderCooldowns.get(asrConfig.asrProvider) || 0
        const now = Date.now()
        if (now < cooldownUntil) {
          throw new ASRClientError(
            `Provider rate limited. Please try again later.`,
            'rate_limited',
            429,
            cooldownUntil - now,
            'asph'
          )
        }

        // Fetch Blob
        const audioBlob = await fetchTrackAudioBlob(
          expectedAudioUrl,
          localTrackId,
          controller.signal
        )

        // Compute fingerprint for deduplication (Instruction 125)
        const fingerprint = await computeAsrFingerprint({
          localTrackId,
          audioBlob,
          model: asrConfig.asrModel,
        })

        // Try applying by fingerprint before hitting the API
        if (await tryApplyFingerprintCache(fingerprint, expectedAudioUrl, requestId)) {
          log('[asr] fingerprint cache hit', { trackKey, fingerprint })
          clearAsrStateForTrack(expectedAudioUrl, requestId, TRANSCRIPT_INGESTION_STATUS.IDLE)
          return
        }

        // AUTO-SAVE: If this was a remote download, persist it to disk now
        // so it appears in the Downloads page (User Requirement).
        if (!localTrackId) {
          // Re-read store fresh — the initial `current` snapshot may be stale
          // after long async operations (fetchTrackAudioBlob, fingerprint).
          const freshState = usePlayerStore.getState()
          const meta = freshState.episodeMetadata
          void persistAudioBlobAsDownload(audioBlob, {
            audioUrl: expectedAudioUrl,
            episodeTitle: freshState.audioTitle,
            podcastTitle: meta?.podcastTitle,
            feedUrl: meta?.podcastFeedUrl,
            artworkUrl: meta?.artworkUrl,
            durationSeconds: meta?.durationSeconds,
            podcastItunesId: meta?.podcastItunesId,
            providerEpisodeId: meta?.providerEpisodeId,
            countryAtSave: normalizeCountryParam(meta?.countryAtSave) ?? DEFAULTS.DEFAULT_COUNTRY,
          })
            .then((res) => {
              if (res.ok) {
                log('[asr] auto-save persisted download', { trackKey, trackId: res.trackId })
              }
            })
            .catch((err) => warn('[asr] auto-save failed', err))
        }
        if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return
        useTranscriptStore
          .getState()
          .setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING)

        // Hit API with retry (handles chunking inside)
        const playerState = usePlayerStore.getState()
        const metadataDuration = playerState.episodeMetadata?.durationSeconds
        const expectedDurationSeconds =
          typeof metadataDuration === 'number' && metadataDuration > 0
            ? metadataDuration
            : playerState.duration > 0
              ? playerState.duration
              : undefined
        const result = await transcribeAudioWithRetry({
          blob: audioBlob,
          apiKey: asrConfig.apiKey,
          provider: asrConfig.asrProvider,
          model: asrConfig.asrModel,
          expectedDurationSeconds,
          signal: controller.signal,
          onProgress: (partialCues) => {
            if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return
            useTranscriptStore.getState().setPartialAsrCues(partialCues)
          },
        })

        if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return

        const cues = result.cues
        if (cues.length === 0) {
          throw new ASRClientError('ASR returned empty cues', 'service_unavailable')
        }

        await persistAsrResult({
          expectedAudioUrl,
          localTrackId,
          episodeTitle: usePlayerStore.getState().audioTitle,
          model: result.model,
          provider: result.provider,
          cues,
          fingerprint,
          taskStartedAt,
        })

        if (!isTrackStillCurrent(expectedAudioUrl, requestId)) return
        const tStore = useTranscriptStore.getState()
        tStore.setPartialAsrCues(null) // Atomic swap: clear volatile memory
        tStore.setSubtitles(cues) // Commit persistent data
        if (trigger === 'manual') {
          toast.successKey('asrSuccess')
        }
        log('[asr] success', { trackKey, cueCount: cues.length, fingerprint })
      } catch (error) {
        // If the error provided a long retryAfterMs, apply provider cooldown globally (regardless of track switch)
        if (
          error instanceof ASRClientError &&
          error.retryAfterMs &&
          error.retryAfterMs > 60000 &&
          asrConfig.ok
        ) {
          asrProviderCooldowns.set(asrConfig.asrProvider, Date.now() + error.retryAfterMs)
        }

        if (isTrackStillCurrent(expectedAudioUrl, requestId)) {
          const result = handleAsrFailure(error, trigger)
          clearAsrStateForTrack(expectedAudioUrl, requestId, result.status, result.error)
          if (result.status === TRANSCRIPT_INGESTION_STATUS.FAILED) {
            logError('[asr] task failed', error)
          }
        }
      } finally {
        const latestTs = useTranscriptStore.getState()
        if (activeController && latestTs.abortAsrController === activeController) {
          latestTs.setAbortAsrController(null)
          latestTs.setAsrActiveTrackKey(null)
          latestTs.setPartialAsrCues(null) // Also clear partials on fail/abort
        }
      }
    } finally {
      // Always release flight lock when the queued task is done returning
      inFlightAsrTasks.delete(trackKeyCheck)
    }
  }

  try {
    if (trigger === 'manual') {
      void backgroundAsrQueue.enqueuePriority(task)
    } else {
      void backgroundAsrQueue.enqueue(task)
    }
  } catch (e) {
    inFlightAsrTasks.delete(trackKeyCheck)
    throw e
  }
}

export function startOnlineASRForCurrentTrack(trigger: OnlineAsrTrigger = 'manual'): void {
  const state = getPlayerStoreStateSafe()
  if (!state) return

  const identityUrl = resolveAsrIdentityUrl(state.audioUrl, state.episodeMetadata)
  if (!identityUrl) return

  void startOnlineASRForTrack({
    expectedAudioUrl: identityUrl,
    requestId: state.loadRequestId,
    localTrackId: state.localTrackId,
    trigger,
  })
}

export async function retranscribeDownloadedTrackWithCurrentSettings(
  trackId: string
): Promise<RetranscribeDownloadResult> {
  const track = await DownloadsRepository.getTrackSnapshot(trackId)
  if (!track) {
    return { ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.TRACK_NOT_FOUND }
  }

  const expectedAudioUrl = normalizeAsrAudioUrl(track.sourceUrlNormalized)
  if (!expectedAudioUrl) {
    return { ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.INVALID_SOURCE }
  }

  const asrConfig = await resolveAsrApiKeyAndSettings()
  if (!asrConfig.ok) {
    return { ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.UNCONFIGURED }
  }

  const trackKey = buildAsrTrackKey(expectedAudioUrl, trackId)
  if (inFlightAsrTasks.has(trackKey)) {
    return { ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.IN_FLIGHT }
  }
  inFlightAsrTasks.add(trackKey)

  return await new Promise((resolve) => {
    const task = async () => {
      try {
        const cooldownUntil = asrProviderCooldowns.get(asrConfig.asrProvider) || 0
        const now = Date.now()
        if (now < cooldownUntil) {
          throw new ASRClientError(
            'Provider rate limited. Please try again later.',
            'rate_limited',
            429,
            cooldownUntil - now,
            'asph'
          )
        }

        const controller = new AbortController()
        const audioBlob = await fetchTrackAudioBlob(expectedAudioUrl, trackId, controller.signal)
        const fingerprint = await computeAsrFingerprint({
          localTrackId: trackId,
          audioBlob,
          model: asrConfig.asrModel,
        })

        const result = await transcribeAudioWithRetry({
          blob: audioBlob,
          apiKey: asrConfig.apiKey,
          provider: asrConfig.asrProvider,
          model: asrConfig.asrModel,
          expectedDurationSeconds: track.durationSeconds,
          signal: controller.signal,
        })

        if (result.cues.length === 0) {
          throw new ASRClientError('ASR returned empty cues', 'service_unavailable')
        }

        const { subtitleFilename, subtitleName } = formatAsrSubtitleName({
          episodeTitle: track.sourceEpisodeTitle || track.name,
          provider: result.provider,
          model: result.model,
        })

        const persistResult = await DownloadsRepository.upsertAsrSubtitleVersion({
          trackId,
          cues: result.cues,
          subtitleName,
          subtitleFilename,
          provider: result.provider,
          model: result.model,
          fingerprint,
          setActive: true,
        })

        if (!persistResult.ok || !persistResult.fileSubtitleId) {
          resolve({ ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.TRACK_NOT_FOUND })
          return
        }

        const playerState = getPlayerStoreStateSafe()
        if (playerState?.localTrackId === trackId) {
          useTranscriptStore.getState().setSubtitles(result.cues)
        }

        toast.successKey('asrSuccess')
        resolve({
          ok: true,
          reason: RETRANSCRIBE_DOWNLOAD_REASON.SUCCESS,
          fileSubtitleId: persistResult.fileSubtitleId,
        })
      } catch (error) {
        if (error instanceof ASRClientError && error.retryAfterMs && error.retryAfterMs > 60000) {
          asrProviderCooldowns.set(asrConfig.asrProvider, Date.now() + error.retryAfterMs)
        }
        handleAsrFailure(error, 'manual')
        if (!isAbortLikeError(error)) {
          warn('[asr] retranscribe download failed', { trackId, error })
        }
        resolve({ ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.FAILED })
      } finally {
        inFlightAsrTasks.delete(trackKey)
      }
    }

    try {
      void backgroundAsrQueue.enqueuePriority(task)
    } catch (error) {
      inFlightAsrTasks.delete(trackKey)
      if (!isAbortLikeError(error)) {
        warn('[asr] failed to enqueue download retranscribe task', { trackId, error })
      }
      resolve({ ok: false, reason: RETRANSCRIBE_DOWNLOAD_REASON.ENQUEUE_FAILED })
    }
  })
}

export async function retranscribeFileTrackWithCurrentSettings(
  trackId: string
): Promise<RetranscribeFileResult> {
  const track = await FilesRepository.getTrackById(trackId)
  if (!isUserUploadTrack(track)) {
    return { ok: false, reason: RETRANSCRIBE_FILE_REASON.TRACK_NOT_FOUND }
  }

  const expectedAudioUrl = normalizeAsrAudioUrl(track.id)
  if (!expectedAudioUrl) {
    return { ok: false, reason: RETRANSCRIBE_FILE_REASON.INVALID_SOURCE }
  }

  const asrConfig = await resolveAsrApiKeyAndSettings()
  if (!asrConfig.ok) {
    return { ok: false, reason: RETRANSCRIBE_FILE_REASON.UNCONFIGURED }
  }

  const trackKey = buildAsrTrackKey(expectedAudioUrl, trackId)
  if (inFlightAsrTasks.has(trackKey)) {
    return { ok: false, reason: RETRANSCRIBE_FILE_REASON.IN_FLIGHT }
  }
  inFlightAsrTasks.add(trackKey)

  return await new Promise((resolve) => {
    const task = async () => {
      try {
        const cooldownUntil = asrProviderCooldowns.get(asrConfig.asrProvider) || 0
        const now = Date.now()
        if (now < cooldownUntil) {
          throw new ASRClientError(
            'Provider rate limited. Please try again later.',
            'rate_limited',
            429,
            cooldownUntil - now,
            'asph'
          )
        }

        const controller = new AbortController()
        const audioBlob = await fetchTrackAudioBlob(expectedAudioUrl, trackId, controller.signal)
        const fingerprint = await computeAsrFingerprint({
          localTrackId: trackId,
          audioBlob,
          model: asrConfig.asrModel,
        })

        const result = await transcribeAudioWithRetry({
          blob: audioBlob,
          apiKey: asrConfig.apiKey,
          provider: asrConfig.asrProvider,
          model: asrConfig.asrModel,
          expectedDurationSeconds: track.durationSeconds,
          signal: controller.signal,
          preferProgressive: false,
        })

        if (result.cues.length === 0) {
          throw new ASRClientError('ASR returned empty cues', 'service_unavailable')
        }

        const { subtitleFilename, subtitleName } = formatAsrSubtitleName({
          episodeTitle: track.name,
          provider: result.provider,
          model: result.model,
        })

        const persistResult = await FilesRepository.upsertAsrSubtitleVersion({
          trackId,
          cues: result.cues,
          subtitleName,
          subtitleFilename,
          provider: result.provider,
          model: result.model,
          fingerprint,
          setActive: true,
        })

        if (!persistResult.ok || !persistResult.fileSubtitleId) {
          resolve({ ok: false, reason: RETRANSCRIBE_FILE_REASON.TRACK_NOT_FOUND })
          return
        }

        const playerState = getPlayerStoreStateSafe()
        if (playerState?.localTrackId === trackId) {
          useTranscriptStore.getState().setSubtitles(result.cues)
        }

        toast.successKey('asrSuccess')
        resolve({
          ok: true,
          reason: RETRANSCRIBE_FILE_REASON.SUCCESS,
          fileSubtitleId: persistResult.fileSubtitleId,
        })
      } catch (error) {
        if (error instanceof ASRClientError && error.retryAfterMs && error.retryAfterMs > 60000) {
          asrProviderCooldowns.set(asrConfig.asrProvider, Date.now() + error.retryAfterMs)
        }
        handleAsrFailure(error, 'manual')
        if (!isAbortLikeError(error)) {
          warn('[asr] retranscribe file failed', { trackId, error })
        }
        resolve({ ok: false, reason: RETRANSCRIBE_FILE_REASON.FAILED })
      } finally {
        inFlightAsrTasks.delete(trackKey)
      }
    }

    try {
      void backgroundAsrQueue.enqueuePriority(task)
    } catch (error) {
      inFlightAsrTasks.delete(trackKey)
      if (!isAbortLikeError(error)) {
        warn('[asr] failed to enqueue file retranscribe task', { trackId, error })
      }
      resolve({ ok: false, reason: RETRANSCRIBE_FILE_REASON.ENQUEUE_FAILED })
    }
  })
}

export function autoIngestEpisodeTranscript(
  transcriptUrl?: string,
  expectedAudioUrl?: string
): void {
  const normalizedUrl = getValidTranscriptUrl(transcriptUrl) || ''
  if (!expectedAudioUrl) return

  const startState = getPlayerStoreStateSafe()
  if (!startState) return
  const requestId = startState.loadRequestId

  const setIngestionStatusIfCurrentTrack = (status: TranscriptIngestionStatus): boolean => {
    const current = getPlayerStoreStateSafe()
    if (!current) return false
    const identityUrl = current.episodeMetadata?.originalAudioUrl || current.audioUrl
    const samePlayback = current.loadRequestId === requestId && identityUrl === expectedAudioUrl
    if (!samePlayback) return false
    useTranscriptStore.getState().setTranscriptIngestionStatus(status)
    return true
  }

  const setTranscriptFailureIfCurrentTrack = (
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): void => {
    const current = getPlayerStoreStateSafe()
    if (!current) return
    const identityUrl = current.episodeMetadata?.originalAudioUrl || current.audioUrl
    const samePlayback = current.loadRequestId === requestId && identityUrl === expectedAudioUrl
    if (!samePlayback) return
    useTranscriptStore.getState().setTranscriptIngestionError({ code, message })
    useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.FAILED)
    log('[remoteTranscript] Transcript fetch failed; transcript source remains available', {
      expectedAudioUrl,
      transcriptSourceHost,
      code,
      ...details,
    })
  }

  const transcriptSourceHost = (() => {
    if (!normalizedUrl) return null
    try {
      return new URL(normalizedUrl).host || null
    } catch {
      return null
    }
  })()

  if (!normalizedUrl) {
    void startOnlineASRForTrack({
      expectedAudioUrl,
      requestId,
      localTrackId: startState.localTrackId,
      trigger: 'auto',
    })
    return
  }

  log(
    '[remoteTranscript] Transcript-first branch active; automatic ASR disabled because transcript exists',
    {
      expectedAudioUrl,
      transcriptSourceHost,
    }
  )

  if (!setIngestionStatusIfCurrentTrack(TRANSCRIPT_INGESTION_STATUS.LOADING)) return

  void loadRemoteTranscriptWithCache(normalizedUrl)
    .then((result) => {
      if (!result.ok || result.cues.length === 0) {
        setTranscriptFailureIfCurrentTrack(
          'transcript_fetch_failed',
          'Transcript available but could not be loaded',
          {
            source: result.source,
            cacheStatus: result.status,
            failureReason: result.reason ?? 'unknown',
          }
        )
        return
      }

      const current = getPlayerStoreStateSafe()
      if (!current) return
      const identityUrl = current.episodeMetadata?.originalAudioUrl || current.audioUrl
      const samePlayback = current.loadRequestId === requestId && identityUrl === expectedAudioUrl

      if (!samePlayback) {
        log('[remoteTranscript] Skip apply due to playback switch', { expectedAudioUrl })
        return
      }

      if (useTranscriptStore.getState().subtitlesLoaded) {
        useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.IDLE)
        log('[remoteTranscript] Skip apply because subtitles already loaded', { expectedAudioUrl })
        return
      }

      useTranscriptStore.getState().setSubtitles(result.cues)
      log('[remoteTranscript] Applied transcript cues', {
        expectedAudioUrl,
        cueCount: result.cues.length,
        source: result.source,
        cacheStatus: result.status,
      })
    })
    .catch((error) => {
      setTranscriptFailureIfCurrentTrack(
        'transcript_fetch_failed',
        'Transcript available but could not be loaded',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
      log('[remoteTranscript] auto-ingest failed', error)
    })
}

export function __resetRemoteTranscriptStateForTests(): void {
  abortRequestsWithPrefix('revalidate:')
  memoryTranscriptCache.clear()
  inFlightAsrTasks.clear()
  asrProviderCooldowns.clear()
}
