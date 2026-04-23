import type { FileTrack, PlaybackSessionCreateInput } from '../dexieDb'
import { normalizeFeedUrl } from '../discovery/feedUrl'
import { normalizeCountryParam } from '../routes/podcastRoutes'
import type { EpisodeMetadata } from '../../store/playerStore'

function normalizeCountrySnapshot(country: string | undefined): string | undefined {
  return normalizeCountryParam(country) ?? undefined
}

function normalizeAudioSnapshot(audioUrl: string | null | undefined): string | undefined {
  if (typeof audioUrl !== 'string') return undefined
  const normalized = audioUrl.trim()
  if (!normalized || normalized.startsWith('blob:')) return undefined
  return normalized
}

function normalizePodcastFeedSnapshot(feedUrl: string | undefined): string | undefined {
  if (typeof feedUrl !== 'string') return undefined
  const normalized = normalizeFeedUrl(feedUrl)
  return normalized || undefined
}

export function resolveSessionAudioSnapshot(
  audioUrl: string | null | undefined,
  metadata?: { originalAudioUrl?: string } | null
): string | undefined {
  return normalizeAudioSnapshot(metadata?.originalAudioUrl) ?? normalizeAudioSnapshot(audioUrl)
}

export function buildManagedPlaybackSessionCreateInput(input: {
  id: string
  audioTitle: string
  durationSeconds: number
  normalizedAudioUrl?: string
  localTrackId?: string | null
  coverArtUrl?: string | Blob | null
  metadata?: EpisodeMetadata | null
}): PlaybackSessionCreateInput | null {
  const { metadata } = input
  const countryAtSave = normalizeCountrySnapshot(metadata?.countryAtSave)
  if (metadata && !countryAtSave) {
    return null
  }

  const base = {
    id: input.id,
    progress: 0,
    durationSeconds: input.durationSeconds,
    audioUrl: input.normalizedAudioUrl,
    audioFilename: input.audioTitle,
    title: input.audioTitle,
    localTrackId: input.localTrackId || undefined,
    artworkUrl:
      metadata?.artworkUrl ||
      (typeof input.coverArtUrl === 'string' ? input.coverArtUrl : undefined),
    description: metadata?.description,
    podcastTitle: metadata?.showTitle,
    podcastFeedUrl: normalizePodcastFeedSnapshot(metadata?.podcastFeedUrl),
    transcriptUrl: metadata?.transcriptUrl,
    publishedAt: metadata?.publishedAt,
    episodeGuid: metadata?.episodeGuid,
    podcastItunesId: metadata?.podcastItunesId,
  }

  if (metadata) {
    return {
      ...base,
      source: 'explore',
      countryAtSave: countryAtSave as string,
    }
  }

  return {
    ...base,
    source: 'local',
  }
}

export function buildLocalTrackPlaybackSessionCreateInput(input: {
  sessionId: string
  track: FileTrack
  subtitleId: string | null
  artworkUrl?: string
}): PlaybackSessionCreateInput {
  return {
    id: input.sessionId,
    source: 'local',
    title: input.track.name,
    audioId: input.track.audioId,
    artworkUrl: input.artworkUrl,
    subtitleId: input.subtitleId,
    hasAudioBlob: true,
    lastPlayedAt: Date.now(),
    localTrackId: input.track.id,
    description: input.track.album || undefined,
    podcastTitle: input.track.artist || undefined,
    durationSeconds: input.track.durationSeconds || 0,
  }
}
