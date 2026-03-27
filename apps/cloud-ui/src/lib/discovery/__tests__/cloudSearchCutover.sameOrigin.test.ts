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
            providerPodcastId: 123,
            collectionName: 'Tech Podcast',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/tech-100.jpg',
            artworkUrl600: 'https://example.com/tech-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/tech-podcast',
            genres: ['Technology'],
            trackCount: 12,
          },
        ])
      })
    )

    const results = await discovery.searchPodcasts('tech', 'us', 20)

    expect(results).toHaveLength(1)
    expect(results[0]?.collectionName).toBe('Tech Podcast')
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
            providerEpisodeId: 999,
            providerPodcastId: 123,
            trackName: 'History Episode',
            collectionName: 'History Podcast',
            episodeUrl: 'https://example.com/history.mp3',
            releaseDate: '2026-03-27T00:00:00.000Z',
            trackTimeMillis: 1800000,
            artworkUrl600: 'https://example.com/history-600.jpg',
            artworkUrl100: 'https://example.com/history-100.jpg',
            description: 'Episode summary',
            episodeGuid: 'guid-history',
            artistName: 'Historian',
            feedUrl: 'https://example.com/history.xml',
          },
        ])
      })
    )

    const results = await discovery.searchEpisodes('history', 'jp', 50)

    expect(results).toHaveLength(1)
    expect(results[0]?.trackName).toBe('History Episode')
    expect(appleSearchHits).toBe(0)
  })
})
