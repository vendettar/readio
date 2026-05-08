/**
 * Download Service (Instruction 124)
 *
 * Handles downloading remote podcast episodes into IndexedDB.
 * Features:
 * - Stream-based downloading (no full-response buffering)
 * - AbortSignal support
 * - Deterministic progress reporting
 * - Dedup by canonical episode identity
 * - Idempotency (no duplicate blob/track rows)
 */

import type { PodcastDownload } from './dexieDb'
import { persistDownloadedEpisodeBlob } from './downloadBlobPersistence'
import { downloadBlobWithProgress } from './downloadBlobTransport'
import {
  buildDownloadProgressStatusKey,
  type DownloadJobOptions,
  normalizeDownloadJobOptions,
  resolveEpisodeDownloadStatusKey,
} from './downloadJobOptions'
import { emitDownloadChange } from './downloadLibraryEvents'
import {
  type CanonicalEpisodeDownloadLookupInput,
  type EpisodeDownloadLookupInput,
  findDownloadedTrackByLookup,
  normalizeCanonicalDownloadIdentity,
} from './downloadLookupResolver'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { deduplicatedFetch, isRequestInflight } from './requestManager'
import { toast } from './toast'

export type {
  DownloadJobOptions,
  DownloadProgress,
  EpisodeDownloadProps,
  EpisodePropsDownloadInput,
  RemoteMetadataDownloadInput,
} from './downloadJobOptions'
export {
  buildDownloadJobOptionsFromCanonicalRemoteMetadata,
  buildDownloadJobOptionsFromEpisodeProps,
} from './downloadJobOptions'
export { emitDownloadChange, subscribeToDownloads } from './downloadLibraryEvents'
export {
  clearAllDownloads,
  getAllDownloadedTracks,
  removeDownloadedTrack,
  sweepOrphanedBlobs,
} from './downloadLibraryMaintenance'
export { useDownloadProgressStore } from './downloadProgressTracking'

export const DOWNLOAD_STATUS = {
  IDLE: 'idle',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  FAILED: 'failed',
} as const

export type DownloadStatus = (typeof DOWNLOAD_STATUS)[keyof typeof DOWNLOAD_STATUS]

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

export async function findDownloadedTrackByCanonicalIdentity(
  podcastItunesId: string,
  episodeGuid: string
): Promise<PodcastDownload | undefined> {
  const canonicalIdentity = normalizeCanonicalDownloadIdentity({ podcastItunesId, episodeGuid })
  if (!canonicalIdentity) return undefined
  return DownloadsRepository.findTrackByPodcastAndEpisode(
    canonicalIdentity.podcastItunesId,
    canonicalIdentity.episodeGuid
  )
}

export async function findDownloadedTrackForEpisode(
  input: EpisodeDownloadLookupInput | CanonicalEpisodeDownloadLookupInput
): Promise<PodcastDownload | undefined> {
  return findDownloadedTrackByLookup(input)
}

const notifySubscribers = emitDownloadChange

export function getStoredDownloadStatusForEpisode(
  input: EpisodeDownloadLookupInput | CanonicalEpisodeDownloadLookupInput
): DownloadStatus {
  const statusKey = resolveEpisodeDownloadStatusKey(input)
  if (!statusKey) return 'idle'
  if (isRequestInflight(`download:${statusKey}`)) return 'downloading'
  if (failedDownloads.has(statusKey)) return 'failed'
  return 'idle'
}

let globalDownloadSemaphore = Promise.resolve()

/**
 * Download a remote episode audio and persist to IndexedDB.
 * Enforces sequential downloading to respect storage limits.
 */
export async function downloadEpisode(options: DownloadJobOptions): Promise<DownloadResult> {
  const silent = options.silent === true
  const normalized = normalizeDownloadJobOptions(options)
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason }
  }
  const {
    audioUrl,
    episodeTitle,
    showTitle,
    artworkUrl,
    countryAtSave,
    podcastItunesId,
    episodeGuid,
  } = normalized.options
  const normalizedUrl = normalized.normalizedAudioUrl
  const downloadStatusKey = buildDownloadProgressStatusKey({
    audioUrl: normalizedUrl,
    podcastItunesId,
    episodeGuid,
  })

  // Idempotency: check if already downloaded
  const existing = await findDownloadedTrackForEpisode({
    audioUrl: normalizedUrl,
    podcastItunesId,
    episodeGuid,
  })
  if (existing) {
    if (!silent) {
      toast.infoKey('downloadAlreadyExists')
    }
    return { ok: true, trackId: existing.id, reason: 'already_downloaded' }
  }

  return deduplicatedFetch(`download:${downloadStatusKey}`, async () => {
    const executor = async () => {
      if (options.signal?.aborted) return { ok: false as const, reason: 'aborted' as const }
      // Wait for any prior download to finish (sequential downloads)
      await globalDownloadSemaphore
      if (options.signal?.aborted) return { ok: false as const, reason: 'aborted' as const }
      return executeDownload({
        ...options,
        audioUrl,
        episodeTitle,
        showTitle,
        artworkUrl,
        countryAtSave,
        podcastItunesId,
        episodeGuid,
      })
    }

    const p = executor()
    // Maintain the semaphore chain regardless of success or failure
    globalDownloadSemaphore = p.catch(() => {}).then(() => {})

    failedDownloads.delete(downloadStatusKey)
    if (!silent) {
      notifySubscribers()
    }

    try {
      const result = await p
      if (!result.ok && result.reason !== 'aborted') {
        failedDownloads.add(downloadStatusKey)
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
  return persistDownloadedEpisodeBlob(
    blob,
    options,
    ({ audioUrl, podcastItunesId, episodeGuid }) =>
      findDownloadedTrackForEpisode({ audioUrl, podcastItunesId, episodeGuid }),
    notifySubscribers
  )
}

async function executeDownload(options: DownloadJobOptions): Promise<DownloadResult> {
  const transportResult = await downloadBlobWithProgress({
    audioUrl: options.audioUrl,
    podcastItunesId: options.podcastItunesId,
    episodeGuid: options.episodeGuid,
    silent: options.silent,
    signal: options.signal,
    onProgress: options.onProgress,
  })
  if (!transportResult.ok) {
    return transportResult
  }

  return persistAudioBlobAsDownload(transportResult.blob, {
    ...options,
    durationSeconds: options.durationSeconds,
  })
}
