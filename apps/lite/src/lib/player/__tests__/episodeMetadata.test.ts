import { describe, expect, it } from 'vitest'
import type { Favorite, PlaybackSession } from '../../dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../../discovery'
import {
  mapFavoriteToPlaybackPayload,
  mapFeedEpisodeToPlaybackPayload,
  mapPlaybackSessionToEpisodeMetadata,
  mapSearchEpisodeToPlaybackPayload,
  mapSessionToPlaybackPayload,
} from '../episodeMetadata'

describe('episodeMetadata mappers', () => {
  it('maps feed episode payload with normalized metadata', () => {
    const episode = {
      id: 'ep-1',
      title: 'Episode',
      audioUrl: 'https://example.com/audio.mp3',
      description: 'desc',
      pubDate: '2024-01-01T00:00:00.000Z',
      durationSeconds: 120,
      providerEpisodeId: 'p-ep-1',
      transcriptUrl: 'https://example.com/transcript.srt',
      artworkUrl: 'https://example.com/ep.jpg',
    } as Episode
    const podcast = {
      collectionName: 'Podcast',
      feedUrl: 'https://example.com/feed.xml',
      providerPodcastId: 123,
      artworkUrl600: 'https://example.com/podcast-600.jpg',
      artworkUrl100: 'https://example.com/podcast-100.jpg',
    } as Podcast

    const payload = mapFeedEpisodeToPlaybackPayload(episode, podcast)
    expect(payload.audioUrl).toBe('https://example.com/audio.mp3')
    expect(payload.metadata.providerPodcastId).toBe('123')
    expect(payload.metadata.providerEpisodeId).toBe('p-ep-1')
    expect(payload.metadata.publishedAt).toBe(new Date('2024-01-01T00:00:00.000Z').getTime())
  })

  it('maps search episode payload with fallback episode id', () => {
    const episode = {
      episodeUrl: 'https://example.com/search.mp3',
      trackName: 'Search Episode',
      collectionName: 'Search Podcast',
      description: 'desc',
      feedUrl: 'https://example.com/search-feed.xml',
      releaseDate: '2024-05-20T00:00:00.000Z',
      trackTimeMillis: 90500,
      providerPodcastId: 456,
      providerEpisodeId: 789,
    } as SearchEpisode

    const payload = mapSearchEpisodeToPlaybackPayload(episode)
    expect(payload.audioUrl).toBe('https://example.com/search.mp3')
    expect(payload.metadata.episodeId).toBe('789')
    expect(payload.metadata.durationSeconds).toBe(91)
    expect(payload.metadata.providerPodcastId).toBe('456')
    expect(payload.metadata.providerEpisodeId).toBe('789')
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
      providerPodcastId: 'pod-1',
      providerEpisodeId: 'ep-1',
      transcriptUrl: 'https://example.com/favorite.srt',
    } as Favorite

    const payload = mapFavoriteToPlaybackPayload(favorite)
    expect(payload.artwork).toBe('https://example.com/episode.jpg')
    expect(payload.metadata.providerPodcastId).toBe('pod-1')
    expect(payload.metadata.providerEpisodeId).toBe('ep-1')
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
      providerPodcastId: 'pod-2',
      providerEpisodeId: 'ep-2',
      transcriptUrl: 'https://example.com/history.srt',
      countryAtSave: 'us',
    } as PlaybackSession

    const mapped = mapSessionToPlaybackPayload(session)
    expect(mapped?.audioUrl).toBe('https://example.com/history.mp3')
    expect(mapped?.metadata.countryAtSave).toBe('us')
    expect(mapped?.metadata.providerEpisodeId).toBe('ep-2')

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
      providerPodcastId: '999',
      providerEpisodeId: '1001',
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
    expect(metadata.providerPodcastId).toBe('999')
    expect(metadata.providerEpisodeId).toBe('1001')
    expect(metadata.publishedAt).toBe(new Date('2024-06-01T00:00:00.000Z').getTime())
  })
})
