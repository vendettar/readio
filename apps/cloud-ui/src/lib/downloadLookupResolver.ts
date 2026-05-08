import type { PodcastDownload } from './dexieDb'
import { normalizePodcastAudioUrl } from './networking/urlUtils'
import { DownloadsRepository } from './repositories/DownloadsRepository'

export interface EpisodeDownloadLookupInput {
  audioUrl?: string | null
}

export interface CanonicalEpisodeDownloadLookupInput extends EpisodeDownloadLookupInput {
  podcastItunesId: string
  episodeGuid: string
}

export interface CanonicalDownloadIdentity {
  podcastItunesId: string
  episodeGuid: string
}

export interface DownloadLookupResolution {
  canonicalIdentity: CanonicalDownloadIdentity | null
  normalizedAudioUrl: string | null
  statusKey: string | null
}

function normalizeRequiredDownloadField(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized || null
}

export function normalizeCanonicalDownloadIdentity(
  input: EpisodeDownloadLookupInput | CanonicalEpisodeDownloadLookupInput
): CanonicalDownloadIdentity | null {
  if (
    !('podcastItunesId' in input) ||
    !('episodeGuid' in input) ||
    typeof input.podcastItunesId !== 'string' ||
    typeof input.episodeGuid !== 'string'
  ) {
    return null
  }
  const podcastItunesId = normalizeRequiredDownloadField(input.podcastItunesId)
  const episodeGuid = normalizeRequiredDownloadField(input.episodeGuid)
  if (!podcastItunesId || !episodeGuid) return null
  return { podcastItunesId, episodeGuid }
}

export function buildCanonicalDownloadRequestKey(
  podcastItunesId: string,
  episodeGuid: string
): string {
  return `canonical:${podcastItunesId}:${episodeGuid}`
}

export function resolveDownloadLookup(
  input: EpisodeDownloadLookupInput | CanonicalEpisodeDownloadLookupInput
): DownloadLookupResolution {
  const canonicalIdentity = normalizeCanonicalDownloadIdentity(input)
  const normalizedAudioUrl = normalizePodcastAudioUrl(input.audioUrl ?? '') || null
  return {
    canonicalIdentity,
    normalizedAudioUrl,
    statusKey: canonicalIdentity
      ? buildCanonicalDownloadRequestKey(
          canonicalIdentity.podcastItunesId,
          canonicalIdentity.episodeGuid
        )
      : normalizedAudioUrl,
  }
}

export async function findDownloadedTrackByLookup(
  input: EpisodeDownloadLookupInput | CanonicalEpisodeDownloadLookupInput
): Promise<PodcastDownload | undefined> {
  const lookup = resolveDownloadLookup(input)
  if (lookup.canonicalIdentity) {
    const canonicalTrack = await DownloadsRepository.findTrackByPodcastAndEpisode(
      lookup.canonicalIdentity.podcastItunesId,
      lookup.canonicalIdentity.episodeGuid
    )
    if (canonicalTrack) return canonicalTrack
  }

  if (!lookup.normalizedAudioUrl) return undefined
  return DownloadsRepository.findTrackByUrl(lookup.normalizedAudioUrl)
}
