import { describe, expect, it } from 'vitest'
import {
  getCanonicalSearchEpisodeIdentity,
  toCanonicalSearchEpisodeRecord,
} from '../searchEpisodeContract'
import { makeSearchEpisode } from './fixtures'

describe('searchEpisodeContract', () => {
  it('projects SearchEpisode into one canonical record shared by downstream flows', () => {
    const episode = makeSearchEpisode({
      podcastItunesId: 'pod-1',
      guid: 'episode-guid-1',
      title: 'Episode One',
      showTitle: 'Search Show',
      artwork: 'https://example.com/search-episode.jpg',
      audioUrl: 'https://example.com/audio.mp3',
      shortDescription: 'desc',
      releaseDate: '2025-01-01T00:00:00Z',
      trackTimeMillis: 54000,
    })

    expect(toCanonicalSearchEpisodeRecord(episode)).toEqual({
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      title: 'Episode One',
      showTitle: 'Search Show',
      artworkUrl: 'https://example.com/search-episode.jpg',
      audioUrl: 'https://example.com/audio.mp3',
      description: 'desc',
      pubDate: '2025-01-01T00:00:00Z',
      durationSeconds: 54,
    })
  })

  it('returns the stable canonical identity for SearchEpisode', () => {
    const episode = makeSearchEpisode({
      podcastItunesId: 'pod-2',
      guid: 'episode-guid-2',
    })

    expect(getCanonicalSearchEpisodeIdentity(episode)).toEqual({
      podcastItunesId: 'pod-2',
      episodeGuid: 'episode-guid-2',
    })
  })
})
