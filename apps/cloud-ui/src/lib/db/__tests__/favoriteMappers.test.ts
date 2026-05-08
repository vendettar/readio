import { describe, expect, it } from 'vitest'
import { makeEpisode, makePodcast, makeSearchEpisode } from '../../discovery/__tests__/fixtures'
import {
  mapCanonicalEpisodeToFavoriteInputs,
  mapPlaybackSessionToFavoriteInputs,
  mapPodcastDownloadToFavoriteInputs,
  mapSearchEpisodeToFavoriteInputs,
} from '../favoriteMappers'

describe('favoriteMappers', () => {
  it('maps canonical PI podcast episodes into strict favorite inputs', () => {
    const inputs = mapCanonicalEpisodeToFavoriteInputs(
      makePodcast({
        podcastItunesId: 'pod-1',
        title: 'Podcast',
        artwork: 'https://example.com/show.jpg',
      }),
      makeEpisode({
        guid: 'episode-guid-1',
        title: 'Episode One',
        audioUrl: 'https://example.com/audio.mp3',
        artworkUrl: 'https://example.com/episode.jpg',
        description: 'desc',
        pubDate: '2025-01-01T00:00:00Z',
        duration: 54,
        transcriptUrl: 'https://example.com/transcript.vtt',
      })
    )

    expect(inputs).toEqual({
      podcast: {
        podcastItunesId: 'pod-1',
        title: 'Podcast',
        artwork: 'https://example.com/show.jpg',
      },
      episode: {
        episodeGuid: 'episode-guid-1',
        title: 'Episode One',
        audioUrl: 'https://example.com/audio.mp3',
        description: 'desc',
        artworkUrl: 'https://example.com/episode.jpg',
        duration: 54,
        pubDate: '2025-01-01T00:00:00Z',
        transcriptUrl: 'https://example.com/transcript.vtt',
      },
    })
  })

  it('maps search episodes into strict favorite inputs using canonical podcast metadata', () => {
    const inputs = mapSearchEpisodeToFavoriteInputs(
      makePodcast({
        podcastItunesId: 'pod-1',
        title: 'Canonical Show',
        artwork: 'https://example.com/show.jpg',
      }),
      makeSearchEpisode({
        guid: 'episode-guid-1',
        title: 'Episode One',
        showTitle: 'Search Show',
        podcastItunesId: 'pod-1',
        artwork: 'https://example.com/search-episode.jpg',
        audioUrl: 'https://example.com/audio.mp3',
        shortDescription: 'desc',
        releaseDate: '2025-01-01T00:00:00Z',
        trackTimeMillis: 54000,
      })
    )

    expect(inputs).toEqual({
      podcast: {
        podcastItunesId: 'pod-1',
        title: 'Canonical Show',
        artwork: 'https://example.com/show.jpg',
      },
      episode: {
        episodeGuid: 'episode-guid-1',
        title: 'Episode One',
        audioUrl: 'https://example.com/audio.mp3',
        description: 'desc',
        artworkUrl: 'https://example.com/search-episode.jpg',
        duration: 54,
        pubDate: '2025-01-01T00:00:00Z',
      },
    })
  })

  it('maps podcast downloads into strict favorite inputs', () => {
    const inputs = mapPodcastDownloadToFavoriteInputs({
      id: 'track-local-only-id',
      sourceType: 'podcast_download',
      name: 'Downloaded Episode',
      audioId: 'audio-1',
      sizeBytes: 1024,
      createdAt: 1700000000000,
      sourceUrlNormalized: 'https://example.com/download.mp3',
      downloadedAt: 1700000000000,
      countryAtSave: 'us',
      sourcePodcastItunesId: 'pod-1',
      sourceEpisodeGuid: 'episode-guid-1',
      sourcePodcastTitle: 'Podcast',
      sourceEpisodeTitle: 'Downloaded Episode',
      sourceDescription: '',
      sourceArtworkUrl: 'https://example.com/art.jpg',
    })

    expect(inputs).toEqual(
      expect.objectContaining({
        podcast: expect.objectContaining({ podcastItunesId: 'pod-1' }),
        episode: expect.objectContaining({ episodeGuid: 'episode-guid-1' }),
      })
    )
  })

  it('fails closed when podcast download identity is incomplete', () => {
    const inputs = mapPodcastDownloadToFavoriteInputs({
      id: 'track-local-only-id',
      sourceType: 'podcast_download',
      name: 'Downloaded Episode',
      audioId: 'audio-1',
      sizeBytes: 1024,
      createdAt: 1700000000000,
      sourceUrlNormalized: 'https://example.com/download.mp3',
      downloadedAt: 1700000000000,
      countryAtSave: 'us',
      sourcePodcastItunesId: '',
      sourceEpisodeGuid: 'episode-guid-1',
      sourcePodcastTitle: 'Podcast',
      sourceEpisodeTitle: 'Downloaded Episode',
      sourceDescription: '',
      sourceArtworkUrl: 'https://example.com/art.jpg',
    })

    expect(inputs).toBeNull()
  })

  it('maps explore playback sessions into strict favorite inputs', () => {
    const inputs = mapPlaybackSessionToFavoriteInputs({
      id: 'session-1',
      source: 'explore',
      title: 'Played Episode',
      createdAt: 1700000000000,
      lastPlayedAt: 1700000000000,
      sizeBytes: 0,
      durationSeconds: 90,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 12,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/download.mp3',
      artworkUrl: 'https://example.com/art.jpg',
      showTitle: 'Podcast',
      countryAtSave: 'us',
      episodeGuid: 'episode-guid-1',
      podcastItunesId: 'pod-1',
      publishedAt: 1700000000000,
    })

    expect(inputs).toEqual(
      expect.objectContaining({
        podcast: expect.objectContaining({ podcastItunesId: 'pod-1' }),
        episode: expect.objectContaining({ episodeGuid: 'episode-guid-1' }),
      })
    )
  })

  it('fails closed for non-navigable playback sessions', () => {
    const inputs = mapPlaybackSessionToFavoriteInputs({
      id: 'session-local-only-id',
      source: 'local',
      title: 'Played Episode',
      createdAt: 1700000000000,
      lastPlayedAt: 1700000000000,
      sizeBytes: 0,
      durationSeconds: 90,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 12,
      audioFilename: '',
      subtitleFilename: '',
    })

    expect(inputs).toBeNull()
  })
})
