import { persistBuiltInTranscriptForTrack } from './downloadBuiltInTranscriptPersistence'
import { checkDownloadCapacity } from './downloadCapacity'
import { type DownloadJobOptions, normalizeDownloadJobOptions } from './downloadJobOptions'
import { isAbortLikeError } from './fetchUtils'
import { warn } from './logger'
import { DownloadsRepository } from './repositories/DownloadsRepository'
import { toast } from './toast'

export interface DownloadBlobPersistenceResult {
  ok: boolean
  trackId?: string
  reason?:
    | 'already_downloaded'
    | 'capacity_blocked'
    | 'network_error'
    | 'quota_error'
    | 'invalid_country'
}

export async function persistDownloadedEpisodeBlob(
  blob: Blob,
  options: DownloadJobOptions,
  findExistingTrack: (input: {
    audioUrl: string
    podcastItunesId: string
    episodeGuid: string
  }) => Promise<{ id: string } | undefined>,
  notifySubscribers: () => void
): Promise<DownloadBlobPersistenceResult> {
  const normalized = normalizeDownloadJobOptions(options)
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason }
  }
  const { episodeTitle, showTitle, artworkUrl, countryAtSave, podcastItunesId, episodeGuid } =
    normalized.options
  const normalizedUrl = normalized.normalizedAudioUrl

  const existing = await findExistingTrack({
    audioUrl: normalizedUrl,
    podcastItunesId,
    episodeGuid,
  })
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

  const filename = deriveFilename(normalizedUrl, episodeTitle)

  try {
    const trackId = await DownloadsRepository.persistDownloadedEpisode({
      blob,
      filename,
      normalizedUrl,
      transcriptUrl: options.transcriptUrl,
      sourcePodcastTitle: showTitle,
      sourceEpisodeTitle: episodeTitle,
      sourceDescription: options.episodeDescription,
      sourceArtworkUrl: artworkUrl,
      countryAtSave,
      sourcePodcastItunesId: podcastItunesId,
      sourceEpisodeGuid: episodeGuid,
      durationSeconds: options.durationSeconds,
    })

    await persistBuiltInTranscriptForTrack(trackId, options)

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
