import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../__tests__/setup'
import discovery from '../index'

describe('cloud discovery 005b same-origin search cutover', () => {
  let appleSearchHits = 0

  beforeEach(() => {
    appleSearchHits = 0
    server.use(
      http.get('https://itunes.apple.com/search', () => {
        appleSearchHits += 1
        return HttpResponse.json({ resultCount: 0, results: [] })
      })
    )
  })

  it('uses same-origin endpoint for podcast search', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/search/podcasts', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('term')).toBe('tech')
        expect(url.searchParams.get('country')).toBe('us')
        expect(url.searchParams.get('limit')).toBe('20')

        return HttpResponse.json([
          {
            id: '123',
            podcastItunesId: '123',
            title: 'Tech Podcast',
            author: 'Host',
            image: 'https://example.com/tech-600.jpg',
            artwork: 'https://example.com/tech-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/tech-podcast',
            genres: ['Technology'],
            episodeCount: 12,
          },
        ])
      })
    )

    const results = await discovery.searchPodcasts('tech', 'us', 20)

    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Tech Podcast')
    expect(appleSearchHits).toBe(0)
  })

  it('uses same-origin endpoint for episode search', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/search/episodes', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('term')).toBe('history')
        expect(url.searchParams.get('country')).toBe('jp')
        expect(url.searchParams.get('limit')).toBe('50')

        return HttpResponse.json([
          {
            id: 'guid-history',
            title: 'History Episode',
            author: 'Historian',
            image: 'https://example.com/history-600.jpg',
            artwork: 'https://example.com/history-600.jpg',
            episodeUrl: 'https://example.com/history.mp3',
            releaseDate: '2026-03-27T00:00:00.000Z',
            trackTimeMillis: 1800000,
            description: 'Episode summary',
            episodeGuid: 'guid-history',
            feedUrl: 'https://example.com/history.xml',
            providerEpisodeId: '999',
            podcastItunesId: '123',
          },
        ])
      })
    )

    const results = await discovery.searchEpisodes('history', 'jp', 50)

    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('History Episode')
    expect(appleSearchHits).toBe(0)
  })
})
