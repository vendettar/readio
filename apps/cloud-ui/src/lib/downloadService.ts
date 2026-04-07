/**
 * Download Service (Instruction 124)
 *
 * Handles downloading remote podcast episodes into IndexedDB.
 * Features:
 * - Stream-based downloading (no full-response buffering)
 * - AbortSignal support
 * - Deterministic progress reporting
 * - Dedup by normalized URL lock
 * - Idempotency (no duplicate blob/track rows)
 */

// ─── Types ───────────────────────────────────────────────────────────
import { create } from 'zustand'
import { DB, DB_TABLE_NAMES, type PodcastDownload } from './dexieDb'
import { checkDownloadCapacity } from './downloadCapacity'
import { CLOUD_BACKEND_FALLBACK_CLASSES, fetchWithFallback, isAbortLikeError } from './fetchUtils'
import { log, error as logError, warn } from './logger'
import { normalizePodcastAudioUrl, unwrapPodcastTrackingUrl } from './networking/urlUtils'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { deduplicatedFetch, isRequestInflight } from './requestManager'
import { normalizeCountryParam } from './routes/podcastRoutes'
import { toast } from './toast'

export interface DownloadProgress {
  loadedBytes: number
  totalBytes: number | null
  percent: number | null
  speedBytesPerSecond?: number
}

interface DownloadProgressStore {
  progressMap: Record<string, DownloadProgress>
  setProgress: (url: string, progress: DownloadProgress | null) => void
}

export const useDownloadProgressStore = create<DownloadProgressStore>((set) => ({
  progressMap: {},
  setProgress: (url, progress) =>
    set((state) => {
      if (progress === null) {
        const newMap = { ...state.progressMap }
        delete newMap[url]
        return { progressMap: newMap }
      }
      return { progressMap: { ...state.progressMap, [url]: progress } }
    }),
}))

export const DOWNLOAD_STATUS = {
  IDLE: 'idle',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  FAILED: 'failed',
} as const

export type DownloadStatus = (typeof DOWNLOAD_STATUS)[keyof typeof DOWNLOAD_STATUS]

export interface DownloadJobOptions {
  audioUrl: string
  episodeTitle?: string
  episodeDescription?: string
  podcastTitle?: string
  feedUrl?: string
  artworkUrl?: string
  silent?: boolean
  signal?: AbortSignal
  onProgress?: (progress: DownloadProgress) => void
  countryAtSave: string
  providerPodcastId?: string
  providerEpisodeId?: string
  durationSeconds?: number
}

export interface DownloadResult {
  ok: boolean
  trackId?: string
  reason?:
    | 'already_downloaded'
    | 'capacity_blocked'
    | 'aborted'
    | 'network_error'
    | 'quota_error'
    | 'invalid_country'
}

// ─── In-flight dedup ─────────────────────────────────────────────────
const failedDownloads = new Set<string>()

/**
 * Check if a given normalizedUrl already has a downloaded local track.
 */
export async function findDownloadedTrack(
  normalizedUrl: string
): Promise<PodcastDownload | undefined> {
  return DownloadsRepository.findTrackByUrl(normalizedUrl)
}

/**
 * Get all downloaded podcast tracks.
 */
export async function getAllDownloadedTracks(): Promise<PodcastDownload[]> {
  return DownloadsRepository.getAllTracks()
}

type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeToDownloads(l: Listener) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function emitDownloadChange() {
  for (const l of listeners) {
    l()
  }
}

const notifySubscribers = emitDownloadChange

/**
 * Check if a download is currently in-flight for a URL.
 */
export function isDownloadInFlight(normalizedUrl: string): boolean {
  return isRequestInflight(`download:${normalizedUrl}`)
}

/**
 * Get the current download status for a URL.
 */
export function getStoredDownloadStatus(normalizedUrl: string): DownloadStatus {
  if (isDownloadInFlight(normalizedUrl)) return 'downloading'
  if (failedDownloads.has(normalizedUrl)) return 'failed'
  return 'idle'
}

let globalDownloadSemaphore = Promise.resolve()

/**
 * Download a remote episode audio and persist to IndexedDB.
 * Enforces sequential downloading to respect storage limits.
 */
export async function downloadEpisode(options: DownloadJobOptions): Promise<DownloadResult> {
  const normalizedUrl = normalizePodcastAudioUrl(options.audioUrl)
  const normalizedCountryAtSave = normalizeCountryParam(options.countryAtSave)
  const silent = options.silent === true
  if (!normalizedUrl) {
    return { ok: false, reason: 'network_error' }
  }
  if (!normalizedCountryAtSave) {
    return { ok: false, reason: 'invalid_country' }
  }

  // Idempotency: check if already downloaded
  const existing = await findDownloadedTrack(normalizedUrl)
  if (existing) {
    if (!silent) {
      toast.infoKey('downloadAlreadyExists')
    }
    return { ok: true, trackId: existing.id, reason: 'already_downloaded' }
  }

  return deduplicatedFetch(`download:${normalizedUrl}`, async () => {
    const executor = async () => {
      if (options.signal?.aborted) return { ok: false as const, reason: 'aborted' as const }
      // Wait for any prior download to finish (sequential downloads)
      await globalDownloadSemaphore
      if (options.signal?.aborted) return { ok: false as const, reason: 'aborted' as const }
      return executeDownload({
        ...options,
        countryAtSave: normalizedCountryAtSave,
      })
    }

    const p = executor()
    // Maintain the semaphore chain regardless of success or failure
    globalDownloadSemaphore = p.catch(() => {}).then(() => {})

    failedDownloads.delete(normalizedUrl)
    if (!silent) {
      notifySubscribers()
    }

    try {
      const result = await p
      if (!result.ok && result.reason !== 'aborted') {
        failedDownloads.add(normalizedUrl)
      }
      return result
    } finally {
      if (!silent) {
        notifySubscribers()
      }
    }
  })
}

/**
 * Persist a pre-downloaded audio blob as a podcast download.
 * Similar to executeDownload but takes an existing Blob.
 */
export async function persistAudioBlobAsDownload(
  blob: Blob,
  options: DownloadJobOptions
): Promise<DownloadResult> {
  const normalizedUrl = normalizePodcastAudioUrl(options.audioUrl)
  const normalizedCountryAtSave = normalizeCountryParam(options.countryAtSave)
  if (!normalizedUrl) {
    return { ok: false, reason: 'network_error' }
  }
  if (!normalizedCountryAtSave) {
    return { ok: false, reason: 'invalid_country' }
  }

  // Idempotency: check if already downloaded
  const existing = await findDownloadedTrack(normalizedUrl)
  if (existing) {
    return { ok: true, trackId: existing.id, reason: 'already_downloaded' }
  }

  const capacityResult = await checkDownloadCapacity(blob.size)
  if (!capacityResult.allowed) {
    if (capacityResult.reason === 'physical_quota_insufficient') {
      toast.errorKey('downloadStorageLimitPhysical')
    } else {
      toast.errorKey('downloadStorageLimitApp')
    }
    return { ok: false, reason: 'capacity_blocked' }
  }

  const filename = deriveFilename(normalizedUrl, options.episodeTitle || '')

  try {
    const trackId = await DB.transaction(
      'rw',
      [DB_TABLE_NAMES.AUDIO_BLOBS, DB_TABLE_NAMES.TRACKS],
      async () => {
        // Concurrency check (Instruction 127): re-check inside transaction to prevent
        // duplicate track creation from multiple racing paths (e.g. ASR auto-save + user download).
        const doubleCheck = await DownloadsRepository.findTrackByUrl(normalizedUrl)

        if (doubleCheck) {
          log('[download] persistAudioBlob: track already exists (concurrency hit)', doubleCheck.id)
          return doubleCheck.id
        }

        const realAudioBlobId = await DB.addAudioBlob(blob, filename)

        const now = Date.now()
        const download: Omit<PodcastDownload, 'id' | 'createdAt' | 'sourceType'> = {
          name: options.episodeTitle || filename,
          audioId: realAudioBlobId,
          sizeBytes: blob.size,
          sourceUrlNormalized: normalizedUrl,
          sourceFeedUrl: options.feedUrl || undefined,
          lastAccessedAt: now,
          sourcePodcastTitle: options.podcastTitle || undefined,
          sourceEpisodeTitle: options.episodeTitle || undefined,
          sourceDescription: options.episodeDescription || undefined,
          sourceArtworkUrl: options.artworkUrl || undefined,
          downloadedAt: now,
          countryAtSave: normalizedCountryAtSave,
          sourceProviderPodcastId: options.providerPodcastId || undefined,
          sourceProviderEpisodeId: options.providerEpisodeId || undefined,
          durationSeconds: options.durationSeconds,
        }

        const id = await DB.addPodcastDownload(download)
        return id
      }
    )

    notifySubscribers()
    return { ok: true, trackId }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      toast.errorKey('downloadStorageLimitPhysical')
      return { ok: false, reason: 'quota_error' }
    }
    if (!isAbortLikeError(err)) {
      warn('[download] Failed to persist ASR blob:', err)
    }
    return { ok: false, reason: 'network_error' }
  }
}

async function executeDownload(options: DownloadJobOptions): Promise<DownloadResult> {
  const { signal, onProgress } = options
  const silent = options.silent === true
  const unwrappedUrl = unwrapPodcastTrackingUrl(options.audioUrl)

  try {
    // Abort guard
    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    // Step 1: HEAD request for Content-Length (pre-flight sizing)
    let contentLength: number | null = null
    try {
      const headRes = await fetchWithFallback<Response>(unwrappedUrl, {
        method: 'HEAD',
        signal,
        raw: true,
        purpose: 'Sizing',
        cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.DOWNLOAD_HEAD,
      })

      // Ensure any preflight raw response body is explicitly canceled when not consumed.
      if (headRes.body) {
        void headRes.body.cancel()
      }
      const clHeader = headRes.headers.get('content-length')
      if (clHeader) {
        const parsed = Number(clHeader)
        if (Number.isFinite(parsed) && parsed > 0) {
          contentLength = parsed
        }
      }
    } catch {
      // HEAD failed — will try GET without content-length info
    }

    // Step 2: Capacity pre-flight
    const capacityResult = await checkDownloadCapacity(contentLength)
    if (!capacityResult.allowed) {
      if (!silent) {
        if (capacityResult.reason === 'physical_quota_insufficient') {
          toast.errorKey('downloadStorageLimitPhysical')
        } else {
          toast.errorKey('downloadStorageLimitApp')
        }
      }
      return { ok: false, reason: 'capacity_blocked' }
    }

    // Step 3: Stream download
    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const response = await fetchWithFallback<Response>(unwrappedUrl, {
      signal,
      raw: true,
      purpose: 'Download',
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.DOWNLOAD_GET,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    // Get content-length from GET response if not from HEAD
    if (contentLength === null) {
      const clHeader = response.headers.get('content-length')
      if (clHeader) {
        const parsed = Number(clHeader)
        if (Number.isFinite(parsed) && parsed > 0) {
          contentLength = parsed
        }
      }
    }

    // Stream-based reading to avoid JS heap OOM while retaining progress UI
    if (!response.body) {
      throw new Error('Response body is not readable')
    }

    let loadedBytes = 0
    let lastReportTime = Date.now()
    let lastLoadedBytes = 0

    const progressStore = useDownloadProgressStore.getState()
    const normalizedUrlKey = normalizePodcastAudioUrl(options.audioUrl)

    const progressStream = new TransformStream({
      transform(chunk: Uint8Array, controller) {
        if (signal?.aborted) {
          controller.error(new DOMException('Aborted', 'AbortError'))
          return
        }
        loadedBytes += chunk.byteLength

        // Calculate speed
        const now = Date.now()
        const timeDiff = now - lastReportTime
        let speedBytesPerSecond: number | undefined

        // Only update speed every ~500ms to avoid jitter
        if (timeDiff > 500) {
          const bytesDiff = loadedBytes - lastLoadedBytes
          speedBytesPerSecond = (bytesDiff / timeDiff) * 1000
          lastReportTime = now
          lastLoadedBytes = loadedBytes
        }

        if (normalizedUrlKey) {
          const percent =
            contentLength !== null && contentLength > 0
              ? Math.min(100, Math.round((loadedBytes / contentLength) * 100))
              : null

          let currentSpeed = speedBytesPerSecond

          if (currentSpeed === undefined && timeDiff <= 500) {
            const currentProgress = progressStore.progressMap[normalizedUrlKey]
            if (currentProgress && currentProgress.speedBytesPerSecond !== undefined) {
              currentSpeed = currentProgress.speedBytesPerSecond
            }
          }

          const progressData = {
            loadedBytes,
            totalBytes: contentLength,
            percent,
            speedBytesPerSecond: currentSpeed,
          }
          progressStore.setProgress(normalizedUrlKey, progressData)

          if (onProgress) {
            onProgress(progressData)
          }
        } else if (onProgress) {
          const percent =
            contentLength !== null && contentLength > 0
              ? Math.min(100, Math.round((loadedBytes / contentLength) * 100))
              : null
          onProgress({ loadedBytes, totalBytes: contentLength, percent })
        }
        controller.enqueue(chunk)
      },
    })

    let blob: Blob
    try {
      // Pipe through progress tracker and let the browser's native Response logic
      // spool the blob to disk, avoiding JS array/heap OOM
      const trackedResponse = new Response(response.body.pipeThrough(progressStream), {
        headers: response.headers,
      })
      blob = await trackedResponse.blob()
    } catch (err: unknown) {
      if ((err as DOMException)?.name === 'AbortError' || signal?.aborted) {
        return { ok: false, reason: 'aborted' }
      }
      throw err
    }

    // Final abort check before persistence
    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    return persistAudioBlobAsDownload(blob, {
      ...options,
      durationSeconds: options.durationSeconds,
    })
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { ok: false, reason: 'aborted' }
    }

    // Check for QuotaExceededError
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      if (!silent) {
        toast.errorKey('downloadStorageLimitPhysical')
      }
      return { ok: false, reason: 'quota_error' }
    }

    if (!isAbortLikeError(err)) {
      warn('[download] Failed:', err)
    }
    return { ok: false, reason: 'network_error' }
  } finally {
    const normalizedUrlKey = normalizePodcastAudioUrl(options.audioUrl)
    if (normalizedUrlKey) {
      if (failedDownloads.has(normalizedUrlKey) || signal?.aborted) {
        // Immediate cleanup on failure/abort
        useDownloadProgressStore.getState().setProgress(normalizedUrlKey, null)
      } else {
        // Deferred cleanup on success: let UI briefly show 100%, then release memory.
        // Without this, progressMap entries accumulate for the entire app session.
        setTimeout(() => {
          useDownloadProgressStore.getState().setProgress(normalizedUrlKey, null)
        }, 2000)
      }
    }
  }
}

/**
 * Remove a downloaded track and its associated blobs.
 * Uses reference-protected cascade cleanup.
 */
export async function removeDownloadedTrack(
  trackId: string,
  options: { suppressNotify?: boolean } = {}
): Promise<boolean> {
  const deleted = await DownloadsRepository.removeTrack(trackId)
  if (deleted && !options.suppressNotify) notifySubscribers()
  return deleted
}

/**
 * Clear All Downloads (Strict Policy from Instruction 124)
 * ONLY targets sourceType === TRACK_SOURCE.PODCAST_DOWNLOAD
 * Reference-protected cascade cleanup.
 * Uses sequential deletion to ensure correct reference counting and data consistency.
 */
export async function clearAllDownloads(): Promise<number> {
  const downloadedTracks = await getAllDownloadedTracks()
  if (downloadedTracks.length === 0) return 0

  let removedCount = 0

  // Use strict sequential deletion to avoid race conditions in reference-protected cleanup
  // (e.g. multiple tracks sharing the same audio blob or subtitle).
  for (const track of downloadedTracks) {
    const success = await DownloadsRepository.removeTrack(track.id)
    if (success) {
      removedCount++
    }
  }

  // Only notify once at the end if anything changed.
  if (removedCount > 0) notifySubscribers()

  return removedCount
}

/**
 * Orphan sweep: remove audioBlobs not referenced by any tracks or playback_sessions.
 * Uses primaryKeys traversal and chunked deletion to maintain low memory overhead.
 * Optimized to avoid full materialize of tracks and sessions.
 */
export async function sweepOrphanedBlobs(): Promise<number> {
  try {
    // 1. Gather all referenced IDs from tracks and sessions.
    // Optimized: Use chunked iteration instead of toArray() to avoid high memory peak.
    const referencedIds = new Set<string>()

    // Use Repository APIs to iterate
    const { FilesRepository } = await import('./repositories/FilesRepository')
    const { PlaybackRepository } = await import('./repositories/PlaybackRepository')

    await FilesRepository.iterateAllTracks((track) => {
      if (track.audioId) referencedIds.add(track.audioId)
      if (track.artworkId) referencedIds.add(track.artworkId)
    })

    await PlaybackRepository.iterateAllPlaybackSessions((session) => {
      if (session.audioId) referencedIds.add(session.audioId)
    })

    // 2. Identify orphans by comparing against referencedIds.
    // Use primaryKeys() to avoid loading heavy Blob data into memory.
    const allBlobIds = await PlaybackRepository.getAllAudioBlobIds()
    const orphanIds = allBlobIds.filter((id) => !referencedIds.has(id))

    // 3. Perform chunked deletion to avoid blocking IndexedDB for too long.
    if (orphanIds.length > 0) {
      const SWEEP_CHUNK_SIZE = 50
      for (let i = 0; i < orphanIds.length; i += SWEEP_CHUNK_SIZE) {
        const chunk = orphanIds.slice(i, i + SWEEP_CHUNK_SIZE)
        await PlaybackRepository.deleteAudioBlobsBulk(chunk)
      }
      log(
        `[download] Swept ${orphanIds.length} orphaned blobs in ${Math.ceil(
          orphanIds.length / SWEEP_CHUNK_SIZE
        )} batches`
      )
    }

    return orphanIds.length
  } catch (err) {
    logError('[download] Orphan sweep failed:', err)
    return 0
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function deriveFilename(normalizedUrl: string, episodeTitle: string): string {
  if (episodeTitle) {
    const safe = episodeTitle.replace(/[^a-zA-Z0-9\s\-_.]/g, '').trim()
    if (safe) return `${safe.slice(0, 100)}.mp3`
  }

  try {
    const url = new URL(normalizedUrl)
    const segments = url.pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    if (last?.includes('.')) return decodeURIComponent(last).slice(0, 100)
  } catch {
    // fallback
  }

  return `download-${Date.now()}.mp3`
}
