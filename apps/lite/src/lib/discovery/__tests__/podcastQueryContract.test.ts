import { describe, expect, it } from 'vitest'
import { buildPodcastFeedQueryKey } from '../podcastQueryContract'

describe('podcastQueryContract', () => {
  it('uses already-normalized feedUrl input as feed key without URL parsing', () => {
    expect(buildPodcastFeedQueryKey('http://example.com/feed.xml')).toEqual([
      'podcast',
      'feed',
      'http://example.com/feed.xml',
    ])
  })

  it('only trims feedUrl and does not canonicalize equivalent variants at query-key layer', () => {
    expect(buildPodcastFeedQueryKey('HTTP://Example.com:80/feed.xml#frag')).toEqual([
      'podcast',
      'feed',
      'HTTP://Example.com:80/feed.xml#frag',
    ])
  })
})
