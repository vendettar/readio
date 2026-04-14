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
            title: 'Top Show',
            author: 'Host',
            image: 'https://example.com/top-1.jpg',
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
            title: 'Top Episode',
            author: 'Host',
            image: 'https://example.com/episode-1.jpg',
            url: 'https://podcasts.apple.com/episode-1',
            genres: [],
            podcastItunesId: '123',
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
    expect(topEpisodes[0]?.podcastItunesId).toBe('123')
    expect(appleLookupHits).toBe(0)
  })

  it('uses explicit PI same-origin endpoints for podcast detail lookups', async () => {
    server.use(
      http.get(
        'http://localhost:3000/api/v1/discovery/podcast-index/podcast-byitunesid',
        ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get('podcastItunesId')).toBe('123')
          expect(url.searchParams.get('country')).toBeNull()

          return HttpResponse.json({
            id: '123',
            podcastItunesId: '123',
            title: 'JP Podcast',
            author: 'JP Host',
            image: 'https://example.com/jp-art-100.jpg',
            artwork: 'https://example.com/jp-art-600.jpg',
            feedUrl: 'https://example.com/jp-feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/jp-podcast',
            genres: [{ genreId: '1', name: 'Technology' }],
            episodeCount: 30,
          })
        }
      ),
      http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('podcastItunesId')).toBe('123')
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
            author: 'JP Podcast',
            feedUrl: 'https://example.com/jp-feed.xml',
            podcastItunesId: '123',
          },
        ])
      })
    )

    const podcast = await discovery.getPodcastIndexPodcastByItunesId('123')
    const episodes = await discovery.getPodcastIndexEpisodes('123', 300)

    expect(podcast?.title).toBe('JP Podcast')
    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.providerEpisodeId).toBe('999')
    expect(appleLookupHits).toBe(0)
  })

  it('uses same-origin discovery endpoint for editor pick guid batch lookup', async () => {
    server.use(
      http.post(
        'http://localhost:3000/api/v1/discovery/podcast-index/podcasts-batch-byguid',
        async ({ request }) => {
          expect(await request.json()).toEqual([
            '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
            'f1ebeaa1-bc5a-534f-8528-0738ae374d55',
          ])

          return HttpResponse.json([
            {
              id: 75075,
              title: 'The Daily',
              url: 'https://example.com/daily.xml',
              link: 'https://podcasts.apple.com/daily',
              author: 'NYT',
              artwork: 'https://example.com/daily.jpg',
              categories: { '1': 'News' },
              podcastItunesId: '1200361736',
              podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
            },
            {
              id: 75076,
              title: 'This American Life',
              url: 'https://example.com/tal.xml',
              link: 'https://podcasts.apple.com/tal',
              author: 'TAL',
              artwork: 'https://example.com/tal.jpg',
              categories: { '2': 'Society' },
              podcastItunesId: '201671138',
              podcastGuid: 'f1ebeaa1-bc5a-534f-8528-0738ae374d55',
            },
          ])
        }
      )
    )

    const podcasts = await discovery.getPodcastIndexPodcastsBatchByGuid([
      '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      'f1ebeaa1-bc5a-534f-8528-0738ae374d55',
    ])

    expect(podcasts).toHaveLength(2)
    expect(podcasts[0]?.id).toBe('1200361736')
    expect(podcasts[0]?.podcastItunesId).toBe('1200361736')
    expect(appleLookupHits).toBe(0)
  })

  it('uses same-origin discovery endpoint for show lookup by podcastItunesId', async () => {
    server.use(
      http.get(
        'http://localhost:3000/api/v1/discovery/podcast-index/podcast-byitunesid',
        ({ request }) => {
          const url = new URL(request.url)
          expect(url.searchParams.get('podcastItunesId')).toBe('1200361736')

          return HttpResponse.json({
            id: '1200361736',
            podcastItunesId: '1200361736',
            title: 'The Daily',
            author: 'NYT',
            image: 'https://example.com/show-100.jpg',
            artwork: 'https://example.com/show-600.jpg',
            feedUrl: 'https://example.com/feed.xml',
            collectionViewUrl: 'https://podcasts.apple.com/show',
            genres: [{ genreId: '1', name: 'News' }],
            episodeCount: 42,
            feedId: '75075',
            podcastGuid: '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
          })
        }
      )
    )

    const podcast = await discovery.getPodcastIndexPodcastByItunesId('1200361736')

    expect(podcast?.title).toBe('The Daily')
    expect(podcast?.podcastItunesId).toBe('1200361736')
    expect(podcast?.podcastItunesId).toBe('1200361736')
    expect(appleLookupHits).toBe(0)
  })

  it('uses same-origin discovery endpoint for exact episode lookup by guid plus podcastItunesId', async () => {
    server.use(
      http.get('http://localhost:3000/api/v1/discovery/podcast-index/episodes', ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('guid')).toBe('episode-guid-42')
        expect(url.searchParams.get('podcastItunesId')).toBe('1200361736')
        expect(url.searchParams.get('feedId')).toBeNull()
        expect(url.searchParams.get('limit')).toBeNull()

        return HttpResponse.json({
          id: 'episode-guid-42',
          title: 'Episode 42',
          description: 'Exact episode payload',
          audioUrl: 'https://example.com/audio.mp3',
          pubDate: '2024-01-01T00:00:00.000Z',
          episodeGuid: 'episode-guid-42',
          podcastItunesId: '1200361736',
        })
      })
    )

    const episode = await discovery.getPodcastIndexEpisodeByGuid('episode-guid-42', '1200361736')

    expect(episode?.episodeGuid).toBe('episode-guid-42')
    expect(episode?.podcastItunesId).toBe('1200361736')
    expect(appleLookupHits).toBe(0)
  })
})
