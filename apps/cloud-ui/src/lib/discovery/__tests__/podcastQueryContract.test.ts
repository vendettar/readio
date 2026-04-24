import { describe, expect, it } from 'vitest'
import {
  PODCAST_DEFAULT_FEED_QUERY_LIMIT,
  buildPodcastFeedQueryKey,
} from '../podcastQueryContract'

describe('podcastQueryContract', () => {
  it('keeps normalized feedUrl input stable in the query key', () => {
    expect(buildPodcastFeedQueryKey('http://example.com/feed.xml')).toEqual([
      'podcast',
      'feed',
      'http://example.com/feed.xml',
      'full',
      'all',
      0,
    ])
  })

  it('canonicalizes equivalent feedUrl variants at query-key layer', () => {
    expect(buildPodcastFeedQueryKey('HTTP://Example.com:80/feed.xml#frag')).toEqual([
      'podcast',
      'feed',
      'http://example.com/feed.xml',
      'full',
      'all',
      0,
    ])
  })

  it('drops default https port and hash for equivalent https feedUrl variants', () => {
    expect(buildPodcastFeedQueryKey('HTTPS://Example.com:443/feed.xml#latest')).toEqual([
      'podcast',
      'feed',
      'https://example.com/feed.xml',
      'full',
      'all',
      0,
    ])
  })

  it('distinguishes paged windows from full-feed requests', () => {
    expect(buildPodcastFeedQueryKey('https://example.com/feed.xml', { limit: 20, offset: 0 })).toEqual([
      'podcast',
      'feed',
      'https://example.com/feed.xml',
      'page',
      20,
      0,
    ])
  })

  it('distinguishes page one from later paged windows', () => {
    expect(
      buildPodcastFeedQueryKey('https://example.com/feed.xml', {
        limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
        offset: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      })
    ).toEqual([
      'podcast',
      'feed',
      'https://example.com/feed.xml',
      'page',
      PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      PODCAST_DEFAULT_FEED_QUERY_LIMIT,
    ])
  })
})
