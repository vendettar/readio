import type { Favorite } from '../libs/dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../libs/discoveryProvider'
import { getDiscoveryArtworkUrl } from '../libs/imageUtils'
import { usePlayerStore } from '../store/playerStore'

export function useEpisodePlayback() {
  const setAudioUrl = usePlayerStore((state) => state.setAudioUrl)
  const play = usePlayerStore((state) => state.play)

  /**
   * Standard playback for Episode + Podcast objects (from Feed)
   */
  const playEpisode = (episode: Episode, podcast: Podcast) => {
    // Prioritize episode artwork over podcast artwork
    const artworkSource = episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100
    const coverArt = getDiscoveryArtworkUrl(artworkSource, 600)

    // Set audio URL with complete metadata
    setAudioUrl(episode.audioUrl, episode.title, coverArt, {
      description: episode.description,
      podcastTitle: podcast.collectionName,
      podcastFeedUrl: podcast.feedUrl,
      artworkUrl: coverArt,
      publishedAt: episode.pubDate ? new Date(episode.pubDate).getTime() : undefined,
      duration: episode.duration,
      episodeId: episode.id,
    })

    play()
  }

  /**
   * Playback for SearchEpisode objects (from Global Search)
   */
  const playSearchEpisode = (episode: SearchEpisode, feedUrl?: string) => {
    const artwork = getDiscoveryArtworkUrl(episode.artworkUrl600 || episode.artworkUrl100, 600)
    const episodeId = episode.episodeGuid || episode.trackId.toString()

    setAudioUrl(episode.episodeUrl, episode.trackName, artwork, {
      description: episode.description,
      podcastTitle: episode.collectionName,
      podcastFeedUrl: feedUrl || episode.feedUrl,
      artworkUrl: artwork,
      publishedAt: episode.releaseDate ? new Date(episode.releaseDate).getTime() : undefined,
      duration: episode.trackTimeMillis ? Math.round(episode.trackTimeMillis / 1000) : undefined,
      episodeId: episodeId,
    })

    play()
  }

  /**
   * Playback for Favorite objects (from Favorites page)
   */
  const playFavorite = (favorite: Favorite) => {
    const artworkSource = favorite.episodeArtworkUrl || favorite.artworkUrl
    const artwork = getDiscoveryArtworkUrl(artworkSource, 600)

    setAudioUrl(favorite.audioUrl, favorite.episodeTitle, artwork, {
      description: favorite.description,
      podcastTitle: favorite.podcastTitle,
      podcastFeedUrl: favorite.feedUrl,
      artworkUrl: artwork,
      publishedAt: favorite.pubDate ? new Date(favorite.pubDate).getTime() : undefined,
      duration: favorite.duration,
      episodeId: favorite.episodeId,
    })

    play()
  }

  return { playEpisode, playSearchEpisode, playFavorite }
}
