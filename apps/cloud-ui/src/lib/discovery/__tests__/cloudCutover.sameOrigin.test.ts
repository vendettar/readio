import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { server } from '../../../__tests__/setup'
import discovery from '../index'

describe('cloud discovery 005a same-origin cutover', () => {
  let appleLookupHits = 0

  beforeEach(() => {
    appleLookupHits = 0
    server.use(
      http.get('https://itunes.apple.com/lookup', () => {
        appleLookupHits += 1
        return HttpResponse.json({ resultCount: 0, results: [] })
      })
    )
  })

  it('uses same-origin discovery endpoints for explore top lists', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/top-podcasts', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('country')).toBe('us')
        expect(url.searchParams.get('limit')).toBe('25')

        return HttpResponse.json([
          {
            id: 'top-1',
            name: 'Top Show',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/top-1.jpg',
            url: 'https://podcasts.apple.com/top-1',
            genres: [{ genreId: '1301', name: 'Arts' }],
          },
        ])
      }),
      http.get('http://localhost:3000/api/v1/discovery/top-episodes', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('country')).toBe('us')
        expect(url.searchParams.get('limit')).toBe('10')

        return HttpResponse.json([
          {
            id: 'episode-1',
            name: 'Top Episode',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/episode-1.jpg',
            url: 'https://podcasts.apple.com/episode-1',
            genres: [],
            providerPodcastId: '123',
            description: 'summary',
          },
        ])
      })
    )

    const topPodcasts = await discovery.fetchTopPodcasts('us', 25)
    const topEpisodes = await discovery.fetchTopEpisodes('us', 10)

    expect(topPodcasts).toHaveLength(1)
    expect(topPodcasts[0]?.id).toBe('top-1')
    expect(topEpisodes).toHaveLength(1)
    expect(topEpisodes[0]?.providerPodcastId).toBe('123')
    expect(appleLookupHits).toBe(0)
  })

  it('uses same-origin discovery endpoints for podcast detail lookups', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('id')).toBe('123')
        expect(url.searchParams.get('country')).toBe('jp')

        return HttpResponse.json({
          providerPodcastId: 123,
          collectionName: 'JP Podcast',
          artistName: 'JP Host',
          artworkUrl100: 'https://example.com/jp-art-100.jpg',
          artworkUrl600: 'https://example.com/jp-art-600.jpg',
          feedUrl: 'https://example.com/jp-feed.xml',
          collectionViewUrl: 'https://podcasts.apple.com/jp-podcast',
          genres: ['Technology'],
          trackCount: 30,
        })
      }),
      http.get('http://localhost:3000/api/v1/discovery/lookup/podcast-episodes', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('id')).toBe('123')
        expect(url.searchParams.get('country')).toBe('jp')
        expect(url.searchParams.get('limit')).toBe('300')

        return HttpResponse.json([
          {
            id: 'guid-1',
            title: 'Episode 1',
            description: 'detail',
            audioUrl: 'https://example.com/ep-1.mp3',
            pubDate: '2026-03-27T00:00:00.000Z',
            artworkUrl: 'https://example.com/ep-1.jpg',
            duration: 123,
            providerEpisodeId: '999',
            collectionName: 'JP Podcast',
            artistName: 'JP Host',
            feedUrl: 'https://example.com/jp-feed.xml',
          },
        ])
      })
    )

    const podcast = await discovery.getPodcast('123', 'jp')
    const episodes = await discovery.getPodcastEpisodes('123', 'jp', 300)

    expect(podcast?.collectionName).toBe('JP Podcast')
    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.providerEpisodeId).toBe('999')
    expect(appleLookupHits).toBe(0)
  })

  it('uses same-origin discovery endpoint for editor picks lookup-by-ids', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/lookup/podcasts', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('ids')).toBe('456,123')
        expect(url.searchParams.get('country')).toBe('jp')

        return HttpResponse.json([
          {
            id: '456',
            name: 'Second Show',
            artistName: 'Second Host',
            artworkUrl100: 'https://example.com/second-100.jpg',
            url: 'https://podcasts.apple.com/second',
            genres: [{ genreId: '1', name: 'Technology' }],
            feedUrl: 'https://example.com/second.xml',
            providerPodcastId: '456',
          },
          {
            id: '123',
            name: 'First Show',
            artistName: 'First Host',
            artworkUrl100: 'https://example.com/first-100.jpg',
            url: 'https://podcasts.apple.com/first',
            genres: [{ genreId: '2', name: 'News' }],
            feedUrl: 'https://example.com/first.xml',
            providerPodcastId: '123',
          },
        ])
      })
    )

    const picks = await discovery.lookupPodcastsByIds(['456', '123'], 'jp')

    expect(picks).toHaveLength(2)
    expect(picks[0]?.id).toBe('456')
    expect(picks[1]?.id).toBe('123')
    expect(appleLookupHits).toBe(0)
  })
})
