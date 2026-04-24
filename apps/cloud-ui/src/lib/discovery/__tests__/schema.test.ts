import { describe, expect, it } from 'vitest'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import { buildPodcastFeedQueryKey } from '../podcastQueryContract'
import { EditorPickPodcastSchema, PIPodcastSchema } from '../schema'

describe('discovery schema feedUrl canonicalization', () => {
  it('canonicalizes PI podcast feedUrl at parse boundary', () => {
    const podcast = PIPodcastSchema.parse({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      feedUrl: normalizeFeedUrl('HTTP://Example.com:80/feed.xml#frag'),
      lastUpdateTime: 1,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
    })

    expect(podcast.feedUrl).toBe('http://example.com/feed.xml')
  })

  it('canonicalizes editor-pick feedUrl at parse boundary', () => {
    const podcast = EditorPickPodcastSchema.parse({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      feedUrl: normalizeFeedUrl('HTTPS://Example.com:443/feed.xml#latest'),
      lastUpdateTime: 1,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
    })

    expect(podcast.feedUrl).toBe('https://example.com/feed.xml')
  })

  it('returns a feedUrl that can be used directly by the query-key contract', () => {
    const podcast = PIPodcastSchema.parse({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      feedUrl: normalizeFeedUrl('HTTP://Example.com:80/feed.xml#frag'),
      lastUpdateTime: 1,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
    })

    expect(buildPodcastFeedQueryKey(podcast.feedUrl)).toEqual([
      'podcast',
      'feed',
      'http://example.com/feed.xml',
      'full',
      'all',
      0,
    ])
  })
})
