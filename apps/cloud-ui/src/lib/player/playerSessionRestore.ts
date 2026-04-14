import type { EpisodeMetadata } from '../../store/playerStore'
import type { PlaybackSession } from '../dexieDb'

export interface RestoredPlaybackState {
  sessionId: string
  audioUrl: string
  audioLoaded: true
  audioTitle: string
  coverArtUrl: string | Blob | null
  progress: number
  status: 'paused'
  isPlaying: false
  activeBlobUrls?: string[]
  localTrackId?: string | null
  episodeMetadata?: EpisodeMetadata
}

export function buildRestoredLocalBlobState(input: {
  session: PlaybackSession
  audioUrl: string
  audioTitle: string
  coverArtUrl: string | Blob | null
  activeBlobUrls: string[]
  localTrackId?: string | null
}): RestoredPlaybackState {
  return {
    sessionId: input.session.id,
    audioUrl: input.audioUrl,
    audioLoaded: true,
    audioTitle: input.audioTitle,
    coverArtUrl: input.coverArtUrl,
    activeBlobUrls: input.activeBlobUrls,
    localTrackId: input.localTrackId ?? input.session.localTrackId ?? null,
    progress: input.session.progress,
    status: 'paused',
    isPlaying: false,
  }
}

export function buildRestoredRemoteSessionState(input: {
  session: PlaybackSession
  audioUrl: string
  coverArtUrl: string | Blob | null
  activeBlobUrls?: string[]
  localTrackId?: string | null
  originalAudioUrl?: string | null
}): RestoredPlaybackState {
  const episodeMetadata: EpisodeMetadata = {
    description: input.session.description,
    podcastTitle: input.session.podcastTitle,
    podcastFeedUrl: input.session.podcastFeedUrl,
    transcriptUrl: input.session.transcriptUrl,
    artworkUrl: input.session.artworkUrl,
    publishedAt: input.session.publishedAt,
    episodeGuid: input.session.episodeGuid,
    podcastItunesId: input.session.podcastItunesId,
    providerEpisodeId: input.session.providerEpisodeId,
    originalAudioUrl: input.originalAudioUrl || input.session.audioUrl || undefined,
  }

  return {
    sessionId: input.session.id,
    audioUrl: input.audioUrl,
    audioLoaded: true,
    audioTitle: input.session.title || '',
    coverArtUrl: input.coverArtUrl,
    progress: input.session.progress,
    status: 'paused',
    isPlaying: false,
    ...(input.activeBlobUrls ? { activeBlobUrls: input.activeBlobUrls } : {}),
    ...(input.localTrackId !== undefined ? { localTrackId: input.localTrackId } : {}),
    episodeMetadata,
  }
}
