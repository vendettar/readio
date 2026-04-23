import { describe, expect, it } from 'vitest'
import type { Favorite, PlaybackSession } from '../../dexieDb'
import type { FeedEpisode, Podcast, SearchEpisode } from '../../discovery'
import {
  mapFavoriteToPlaybackPayload,
  mapFeedEpisodeToPlaybackPayload,
  mapPlaybackSessionToEpisodeMetadata,
  mapSearchEpisodeToPlaybackPayload,
  mapSessionToPlaybackPayload,
} from '../episodeMetadata'

function makeFeedEpisode(overrides: Partial<FeedEpisode> = {}): FeedEpisode {
  return {
    episodeGuid: 'test-ep',
    title: 'Test Episode',
    description: 'Test description',
    audioUrl: 'https://example.com/audio.mp3',
    pubDate: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makePodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    podcastItunesId: '123',
    title: 'Test Podcast',
    author: 'Test Author',
    artwork: 'https://example.com/art.jpg',
    description: 'Test description',
    feedUrl: 'https://example.com/feed.xml',
    lastUpdateTime: 1704067200,
    episodeCount: 10,
    language: 'en',
    genres: ['Technology'],
    dead: false,
    ...overrides,
  }
}

describe('episodeMetadata mappers', () => {
  it('maps feed episode payload with normalized metadata', () => {
    const episode = makeFeedEpisode({
      episodeGuid: 'feed-guid-1',
      title: 'Episode',
      audioUrl: 'https://example.com/audio.mp3',
      description: 'desc',
      pubDate: '2024-01-01T00:00:00.000Z',
      duration: 120,
      transcriptUrl: 'https://example.com/transcript.srt',
      artworkUrl: 'https://example.com/ep.jpg',
    })
    const podcast = makePodcast({
      title: 'Podcast',
      feedUrl: 'https://example.com/feed.xml',
      podcastItunesId: '123',
      author: 'Host',
      artwork: 'https://example.com/podcast-600.jpg',
      description: 'A podcast',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
      dead: false,
    })

    const payload = mapFeedEpisodeToPlaybackPayload(episode, podcast)
    expect(payload.audioUrl).toBe('https://example.com/audio.mp3')
    expect(payload.metadata.podcastItunesId).toBe('123')
    expect(payload.metadata.episodeGuid).toBe('feed-guid-1')
    expect(payload.metadata.publishedAt).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
  })

  it('maps search episode payload with canonical episode identity', () => {
    const episode: SearchEpisode = {
      episodeUrl: 'https://example.com/search.mp3',
      episodeGuid: 'search-guid-1',
      title: 'Search Episode',
      showTitle: 'Search Podcast',
      shortDescription: 'desc',
      releaseDate: '2024-05-20T00:00:00.000Z',
      trackTimeMillis: 90500,
      podcastItunesId: '456',
      artwork: 'https://example.com/search-art.jpg',
    }

    const payload = mapSearchEpisodeToPlaybackPayload(episode)
    expect(payload.audioUrl).toBe('https://example.com/search.mp3')
    expect(payload.metadata.durationSeconds).toBe(91)
    expect(payload.metadata.podcastItunesId).toBe('456')
    expect(payload.metadata.episodeGuid).toBe('search-guid-1')
    expect(payload.metadata.episodeGuid).toBeDefined()
    expect(payload.metadata.showTitle).toBe('Search Podcast')
  })

  it('maps favorite payload with episode artwork priority', () => {
    const favorite = {
      id: 'fav-1',
      key: 'k',
      feedUrl: 'https://example.com/feed.xml',
      audioUrl: 'https://example.com/favorite.mp3',
      episodeTitle: 'Favorite',
      podcastTitle: 'Podcast',
      artworkUrl: 'https://example.com/podcast.jpg',
      episodeArtworkUrl: 'https://example.com/episode.jpg',
      addedAt: Date.now(),
      podcastItunesId: 'pod-1',
      transcriptUrl: 'https://example.com/favorite.srt',
    } as Favorite

    const payload = mapFavoriteToPlaybackPayload(favorite)
    expect(payload.artwork).toBe('https://example.com/episode.jpg')
    expect(payload.metadata.podcastItunesId).toBe('pod-1')
    expect(payload.transcriptUrl).toBe('https://example.com/favorite.srt')
  })

  it('maps history session payload and returns null when session has no audioUrl', () => {
    const session = {
      id: 's-1',
      source: 'explore',
      title: 'History',
      createdAt: 1,
      lastPlayedAt: 1,
      sizeBytes: 0,
      durationSeconds: 35,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/history.mp3',
      publishedAt: 1234,
      podcastItunesId: 'pod-2',
      transcriptUrl: 'https://example.com/history.srt',
      countryAtSave: 'us',
    } as PlaybackSession

    const mapped = mapSessionToPlaybackPayload(session)
    expect(mapped?.audioUrl).toBe('https://example.com/history.mp3')
    expect(mapped?.metadata.countryAtSave).toBe('us')

    expect(
      mapSessionToPlaybackPayload({
        ...session,
        audioUrl: undefined,
      })
    ).toBeNull()
  })

  it('maps playback session metadata with artwork override and local-source fields', () => {
    const session = {
      id: 's-local',
      source: 'local',
      title: 'Local History',
      createdAt: 1,
      lastPlayedAt: 1,
      sizeBytes: 1,
      durationSeconds: 90,
      audioId: 'audio-1',
      subtitleId: 'sub-1',
      hasAudioBlob: true,
      progress: 10,
      audioFilename: 'local.mp3',
      subtitleFilename: 'local.srt',
      audioUrl: 'https://example.com/local.mp3',
      artworkUrl: 'https://example.com/default-art.jpg',
      podcastTitle: 'Podcast',
      podcastFeedUrl: 'https://example.com/feed.xml',
      publishedAt: new Date('2024-06-01T00:00:00.000Z').getTime(),
      podcastItunesId: '999',
      transcriptUrl: 'https://example.com/local.srt',
      countryAtSave: 'us',
    } as PlaybackSession

    const metadata = mapPlaybackSessionToEpisodeMetadata(
      session,
      'https://example.com/override-art.jpg'
    )
    expect(metadata.artworkUrl).toBe('https://example.com/override-art.jpg')
    expect(metadata.originalAudioUrl).toBe('https://example.com/local.mp3')
    expect(metadata.countryAtSave).toBe('us')
    expect(metadata.podcastItunesId).toBe('999')
    expect(metadata.publishedAt).toBe(new Date('2024-06-01T00:00:00.000Z').getTime())
  })
})
