import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../../__tests__/setup'

describe('cloud discovery 005d runtime cutover', () => {
  beforeEach(() => {
    vi.resetModules()
    server.resetHandlers()
  })

  it('keeps migrated discovery flows on same-origin endpoints without browser-direct config', async () => {
    const getAppConfigMock = vi.fn(() => {
      throw new Error('migrated cloud discovery should not read browser-direct runtime config')
    })

    vi.doMock('../../runtimeConfig', async () => {
      const actual =
        await vi.importActual<typeof import('../../runtimeConfig')>('../../runtimeConfig')

      return {
        ...actual,
        getAppConfig: getAppConfigMock,
      }
    })

    vi.doMock('../providers/apple', () => ({
      appleProvider: {
        id: 'apple',
        searchPodcasts: vi.fn(async () => []),
        searchEpisodes: vi.fn(async () => []),
        lookupPodcast: vi.fn(async () => null),
        lookupPodcastEpisodes: vi.fn(async () => []),
        lookupEpisode: vi.fn(async () => null),
        lookupPodcastsByIds: vi.fn(async () => []),
        fetchPodcastFeed: vi.fn(async () => ({
          title: '',
          description: '',
          artworkUrl: '',
          episodes: [],
        })),
        fetchTopPodcasts: vi.fn(async () => []),
        fetchTopEpisodes: vi.fn(async () => []),
        fetchTopSubscriberPodcasts: vi.fn(async () => []),
      },
      clearDiscoveryMemoryCache: vi.fn(),
      DISCOVERY_CACHE_KEY_BUILDERS: {},
      DISCOVERY_CACHE_TTLS_MS: {},
      runDiscoveryCacheMaintenance: vi.fn(),
    }))

    server.use(
      http.get('http://localhost:3000/api/v1/discovery/top-podcasts', () =>
        HttpResponse.json([
          {
            id: 'top-1',
            name: 'Top Show',
            artistName: 'Host',
            artworkUrl100: 'https://example.com/top-1.jpg',
            url: 'https://podcasts.apple.com/top-1',
            genres: [{ genreId: '1301', name: 'Arts' }],
          },
        ])
      ),
      http.get('http://localhost:3000/api/v1/discovery/top-episodes', () =>
        HttpResponse.json([
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
      ),
      http.get('http://localhost:3000/api/v1/discovery/search/podcasts', () =>
        HttpResponse.json([
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
      ),
      http.get('http://localhost:3000/api/v1/discovery/search/episodes', () =>
        HttpResponse.json([
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
      ),
      http.get('http://localhost:3000/api/v1/discovery/lookup/podcast', () =>
        HttpResponse.json({
          providerPodcastId: 123,
          collectionName: 'Cloud Podcast',
          artistName: 'Host',
          artworkUrl100: 'https://example.com/podcast-100.jpg',
          artworkUrl600: 'https://example.com/podcast-600.jpg',
          feedUrl: 'https://example.com/feed.xml',
          collectionViewUrl: 'https://podcasts.apple.com/cloud-podcast',
          genres: ['Technology'],
          trackCount: 2,
        })
      ),
      http.get('http://localhost:3000/api/v1/discovery/lookup/podcast-episodes', () =>
        HttpResponse.json([
          {
            id: 'guid-1',
            title: 'Episode 1',
            description: 'detail',
            audioUrl: 'https://example.com/ep-1.mp3',
            pubDate: '2026-03-27T00:00:00.000Z',
            artworkUrl: 'https://example.com/ep-1.jpg',
            duration: 123,
            providerEpisodeId: '999',
            collectionName: 'Cloud Podcast',
            artistName: 'Host',
            feedUrl: 'https://example.com/feed.xml',
          },
        ])
      ),
      http.get('http://localhost:3000/api/v1/discovery/feed', () =>
        HttpResponse.json({
          title: 'Cloud Podcast',
          description: 'Backend-owned feed',
          artworkUrl: 'https://example.com/feed-art.jpg',
          episodes: [
            {
              id: 'ep-1',
              title: 'Episode 1',
              description: 'Episode description',
              audioUrl: 'https://example.com/audio-1.mp3',
              pubDate: '2026-03-27T00:00:00.000Z',
            },
          ],
        })
      )
    )

    const discovery = (await import('../index')).default

    const [topPodcasts, topEpisodes, podcasts, episodes, podcast, podcastEpisodes, feed] =
      await Promise.all([
        discovery.fetchTopPodcasts('us', 25),
        discovery.fetchTopEpisodes('us', 10),
        discovery.searchPodcasts('tech', 'us', 20),
        discovery.searchEpisodes('history', 'jp', 50),
        discovery.getPodcast('123', 'us'),
        discovery.getPodcastEpisodes('123', 'us', 300),
        discovery.fetchPodcastFeed('https://example.com/feed.xml'),
      ])

    expect(topPodcasts[0]?.id).toBe('top-1')
    expect(topEpisodes[0]?.providerPodcastId).toBe('123')
    expect(podcasts[0]?.collectionName).toBe('Tech Podcast')
    expect(episodes[0]?.trackName).toBe('History Episode')
    expect(podcast?.collectionName).toBe('Cloud Podcast')
    expect(podcastEpisodes[0]?.providerEpisodeId).toBe('999')
    expect(feed.episodes[0]?.id).toBe('ep-1')
    expect(getAppConfigMock).not.toHaveBeenCalled()
  })
})
