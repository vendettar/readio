import { describe, expect, it } from 'vitest'
import {
  buildPodcastDetailQueryKey,
  buildPodcastEpisodesQueryKey,
  buildPodcastEpisodesQueryPrefix,
  PODCAST_EPISODES_QUERY_FAMILY,
} from '../podcastQueryContract'

describe('podcastQueryContract', () => {
  it('keys page-rendering PI episode lists by trimmed podcastItunesId', () => {
    expect(buildPodcastEpisodesQueryKey(' 123 ')).toEqual([
      'podcast',
      'episodes',
      '123',
      PODCAST_EPISODES_QUERY_FAMILY,
      'lut-na',
      'count-na',
    ])
  })

  it('adds route-country authority to page-rendering PI episode-list keys when present', () => {
    expect(buildPodcastEpisodesQueryKey('123', undefined, 'jp')).toEqual([
      'podcast',
      'episodes',
      '123',
      'country-jp',
      PODCAST_EPISODES_QUERY_FAMILY,
      'lut-na',
      'count-na',
    ])
  })

  it('keys page-rendering PI episode lists by authority markers when present', () => {
    expect(buildPodcastEpisodesQueryKey('123', { lastUpdateTime: 42, episodeCount: 7 })).toEqual([
      'podcast',
      'episodes',
      '123',
      PODCAST_EPISODES_QUERY_FAMILY,
      'lut-42',
      'count-7',
    ])
  })

  it('exposes a stable PI episode-list key prefix for same-podcast family scans', () => {
    expect(buildPodcastEpisodesQueryPrefix(' 123 ')).toEqual([
      'podcast',
      'episodes',
      '123',
      PODCAST_EPISODES_QUERY_FAMILY,
    ])
  })

  it('keys podcast detail only by trimmed podcastItunesId', () => {
    expect(buildPodcastDetailQueryKey(' 123 ')).toEqual(['podcast', 'podcast-detail', '123'])
  })

  it('adds route-country authority to podcast detail keys when present', () => {
    expect(buildPodcastDetailQueryKey('123', 'jp')).toEqual([
      'podcast',
      'podcast-detail',
      '123',
      'country-jp',
    ])
  })
})
