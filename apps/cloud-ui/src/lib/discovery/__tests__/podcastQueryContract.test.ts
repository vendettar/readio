import { describe, expect, it } from 'vitest'
import { buildPodcastFeedQueryKey } from '../podcastQueryContract'

describe('podcastQueryContract', () => {
  it('keeps normalized feedUrl input stable in the query key', () => {
    expect(buildPodcastFeedQueryKey('http://example.com/feed.xml')).toEqual([
      'podcast',
      'feed',
      'http://example.com/feed.xml',
    ])
  })

  it('canonicalizes equivalent feedUrl variants at query-key layer', () => {
    expect(buildPodcastFeedQueryKey('HTTP://Example.com:80/feed.xml#frag')).toEqual([
      'podcast',
      'feed',
      'http://example.com/feed.xml',
    ])
  })

  it('drops default https port and hash for equivalent https feedUrl variants', () => {
    expect(buildPodcastFeedQueryKey('HTTPS://Example.com:443/feed.xml#latest')).toEqual([
      'podcast',
      'feed',
      'https://example.com/feed.xml',
    ])
  })
})
