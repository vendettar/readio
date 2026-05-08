import { describe, expect, it } from 'vitest'
import type { ExplorePlaybackSession, Favorite, LocalPlaybackSession, PlaybackSession } from '../../dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../../discovery'
import {
  mapEpisodeToPlaybackPayload,
  mapFavoriteToPlaybackPayload,
  mapPlaybackSessionToEpisodeMetadata,
  mapSearchEpisodeToPlaybackPayload,
  mapSessionToPlaybackPayload,
} from '../episodeMetadata'

function makeEpisode(overrides: Partial<Episode> & { guid?: string } = {}): Episode {
  return {
    guid: 'test-ep',
    title: 'Test Episode',
    description: 'Test description',
    audioUrl: 'https://example.com/audio.mp3',
    pubDate: '2024-01-01T00:00:00.000Z',
    duration: 120,
    explicit: false,
    link: 'https://example.com/episodes/test-ep',
    ...overrides,
  } as Episode
}

function makePodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    podcastItunesId: '123',
    title: 'Test Podcast',
    author: 'Test Author',
    artwork: 'https://example.com/art.jpg',
    description: 'Test description',
    lastUpdateTime: 1704067200,
    episodeCount: 10,
    language: 'en',
    genres: ['Technology'],
    ...overrides,
  }
}

describe('episodeMetadata mappers', () => {
  it('maps PI episode payload with normalized metadata', () => {
    const episode = makeEpisode({
      guid: 'feed-guid-1',
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
      podcastItunesId: '123',
      author: 'Host',
      artwork: 'https://example.com/podcast-600.jpg',
      description: 'A podcast',
      lastUpdateTime: 1613394044,
      episodeCount: 50,
      language: 'en',
      genres: ['Technology'],
    })

    const payload = mapEpisodeToPlaybackPayload(episode, podcast)
    expect(payload.audioUrl).toBe('https://example.com/audio.mp3')
    expect(payload.metadata.showTitle).toBe('Podcast')
    expect(payload.metadata.artworkUrl).toBe('https://example.com/ep.jpg')
    expect(payload.metadata.durationSeconds).toBe(120)
    expect(payload.metadata.podcastItunesId).toBe('123')
    expect(payload.metadata.episodeGuid).toBe('feed-guid-1')
    expect(payload.metadata.publishedAt).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
  })

  it('maps search episode payload with canonical episode identity', () => {
    const episode: SearchEpisode = {
      audioUrl: 'https://example.com/search.mp3',
      guid: 'search-guid-1',
      title: 'Search Episode',
      showTitle: 'Search Podcast',
      shortDescription: 'desc',
      releaseDate: '2024-05-20T00:00:00.000Z',
      trackTimeMillis: 90500,
      podcastItunesId: '456',
      artwork: 'https://example.com/search-art.jpg',
    } as SearchEpisode

    const payload = mapSearchEpisodeToPlaybackPayload(episode)
    expect(payload.audioUrl).toBe('https://example.com/search.mp3')
    expect(payload.metadata.durationSeconds).toBe(91)
    expect(payload.metadata.podcastItunesId).toBe('456')
    expect(payload.metadata.episodeGuid).toBe('search-guid-1')
    expect(payload.metadata.episodeGuid).toBeDefined()
    expect(payload.metadata.showTitle).toBe('Search Podcast')
    expect(payload.metadata.artworkUrl).toBe('https://example.com/search-art.jpg')
  })

  it('maps favorite payload with episode artwork priority', () => {
    const favorite: Favorite = {
      id: 'fav-1',
      key: 'pod-1::favorite-guid-1',
      audioUrl: 'https://example.com/favorite.mp3',
      episodeTitle: 'Favorite',
      podcastTitle: 'Podcast',
      artworkUrl: 'https://example.com/podcast.jpg',
      episodeArtworkUrl: 'https://example.com/art.jpg',
      addedAt: Date.now(),
      description: 'Test description',
      pubDate: '2025-02-01',
      durationSeconds: 180,
      podcastItunesId: 'pod-1',
      episodeGuid: 'favorite-guid-1',
      transcriptUrl: 'https://example.com/favorite.srt',
      countryAtSave: 'us',
    }

    const payload = mapFavoriteToPlaybackPayload(favorite)
    expect(payload.artwork).toBe('https://example.com/art.jpg')
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
      artworkUrl: 'https://example.com/history.jpg',
      showTitle: 'History Podcast',
      publishedAt: 1234,
      podcastItunesId: 'pod-2',
      episodeGuid: 'history-guid-1',
      transcriptUrl: 'https://example.com/history.srt',
      countryAtSave: 'us',
    } as ExplorePlaybackSession

    const mapped = mapSessionToPlaybackPayload(session)
    expect(mapped?.audioUrl).toBe('https://example.com/history.mp3')
    expect(mapped?.metadata.kind).toBe('remote-episode')
    expect(mapped?.metadata.countryAtSave).toBe('us')

    expect(
      mapSessionToPlaybackPayload({
        ...session,
        audioUrl: undefined,
      } as unknown as PlaybackSession)
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
      showTitle: 'Podcast',
      publishedAt: new Date('2024-06-01T00:00:00.000Z').getTime(),
      transcriptUrl: 'https://example.com/local.srt',
    } as LocalPlaybackSession

    const metadata = mapPlaybackSessionToEpisodeMetadata(
      session,
      'https://example.com/override-art.jpg'
    )
    expect(metadata.kind).toBe('local')
    expect(metadata.artworkUrl).toBe('https://example.com/override-art.jpg')
    expect(metadata.originalAudioUrl).toBe('https://example.com/local.mp3')
    expect(metadata.countryAtSave).toBeUndefined()
    expect(metadata.podcastItunesId).toBeUndefined()
    expect(metadata.episodeGuid).toBeUndefined()
    expect(metadata.publishedAt).toBe(new Date('2024-06-01T00:00:00.000Z').getTime())
  })

  it('normalizes remote playback-session metadata into explicit canonical remote metadata', () => {
    const metadata = mapPlaybackSessionToEpisodeMetadata({
      id: 's-remote-normalized',
      source: 'explore',
      title: 'Remote History',
      createdAt: 1,
      lastPlayedAt: 1,
      sizeBytes: 1,
      durationSeconds: 90,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 10,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/remote.mp3',
      artworkUrl: ' https://example.com/remote-art.jpg ',
      showTitle: ' Remote Podcast ',
      publishedAt: 1234,
      transcriptUrl: 'https://example.com/remote.srt',
      podcastItunesId: ' podcast-remote ',
      episodeGuid: ' episode-remote ',
      countryAtSave: 'US',
    } as PlaybackSession)

    expect(metadata.kind).toBe('remote-episode')
    expect(metadata.showTitle).toBe('Remote Podcast')
    expect(metadata.artworkUrl).toBe('https://example.com/remote-art.jpg')
    expect(metadata.podcastItunesId).toBe('podcast-remote')
    expect(metadata.episodeGuid).toBe('episode-remote')
    expect(metadata.countryAtSave).toBe('us')
  })
})
