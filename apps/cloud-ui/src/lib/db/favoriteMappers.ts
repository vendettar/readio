import type { Episode, Podcast, SearchEpisode } from '../discovery'
import { toCanonicalSearchEpisodeRecord } from '../discovery/searchEpisodeContract'
import type {
  FavoriteEpisodeInput,
  FavoritePodcastInput,
  PlaybackSession,
  PodcastDownload,
} from './types'
import { isNavigableExplorePlaybackSession } from './types'

function mapPodcastToFavoriteInput(
  podcast: Pick<Podcast, 'podcastItunesId' | 'title' | 'artwork'>
) {
  return {
    podcastItunesId: podcast.podcastItunesId,
    title: podcast.title,
    artwork: podcast.artwork,
  } satisfies FavoritePodcastInput
}

export function mapCanonicalEpisodeToFavoriteInputs(
  podcast: Podcast,
  episode: Episode
): { podcast: FavoritePodcastInput; episode: FavoriteEpisodeInput } {
  return {
    podcast: mapPodcastToFavoriteInput(podcast),
    episode: {
      episodeGuid: episode.guid,
      title: episode.title,
      audioUrl: episode.audioUrl,
      description: episode.description,
      artworkUrl: episode.artworkUrl,
      duration: episode.duration,
      pubDate: episode.pubDate,
      transcriptUrl: episode.transcriptUrl,
    },
  }
}

export function mapSearchEpisodeToFavoriteInputs(
  podcast: Podcast,
  episode: SearchEpisode
): { podcast: FavoritePodcastInput; episode: FavoriteEpisodeInput } {
  const canonicalEpisode = toCanonicalSearchEpisodeRecord(episode)

  return {
    podcast: mapPodcastToFavoriteInput(podcast),
    episode: {
      episodeGuid: canonicalEpisode.episodeGuid,
      title: canonicalEpisode.title,
      audioUrl: canonicalEpisode.audioUrl,
      description: canonicalEpisode.description,
      artworkUrl: canonicalEpisode.artworkUrl,
      duration: canonicalEpisode.durationSeconds ?? 0,
      pubDate: canonicalEpisode.pubDate,
    },
  }
}

export function mapPodcastDownloadToFavoriteInputs(
  track: PodcastDownload
): { podcast: FavoritePodcastInput; episode: FavoriteEpisodeInput } | null {
  if (
    !track.sourcePodcastItunesId ||
    !track.sourceEpisodeGuid ||
    !track.sourcePodcastTitle ||
    !track.sourceEpisodeTitle ||
    !track.sourceArtworkUrl
  ) {
    return null
  }

  return {
    podcast: mapPodcastToFavoriteInput({
      podcastItunesId: track.sourcePodcastItunesId,
      title: track.sourcePodcastTitle,
      artwork: track.sourceArtworkUrl,
    }),
    episode: {
      episodeGuid: track.sourceEpisodeGuid,
      title: track.sourceEpisodeTitle,
      audioUrl: track.sourceUrlNormalized,
      description: track.sourceDescription,
      artworkUrl: track.sourceArtworkUrl,
      duration: track.durationSeconds ?? 0,
      pubDate: new Date(track.downloadedAt).toISOString(),
      transcriptUrl: track.transcriptUrl,
    },
  }
}

export function mapPlaybackSessionToFavoriteInputs(
  session: PlaybackSession
): { podcast: FavoritePodcastInput; episode: FavoriteEpisodeInput } | null {
  if (!isNavigableExplorePlaybackSession(session) || !session.audioUrl || !session.artworkUrl) {
    return null
  }

  if (!session.publishedAt) {
    return null
  }

  return {
    podcast: mapPodcastToFavoriteInput({
      podcastItunesId: session.podcastItunesId,
      title: session.showTitle,
      artwork: session.artworkUrl,
    }),
    episode: {
      episodeGuid: session.episodeGuid,
      title: session.title,
      audioUrl: session.audioUrl,
      description: session.description ?? '',
      artworkUrl: session.artworkUrl,
      duration: session.durationSeconds,
      pubDate: session.publishedAt ? new Date(session.publishedAt).toISOString().split('T')[0] : '',
      transcriptUrl: session.transcriptUrl,
    },
  }
}
