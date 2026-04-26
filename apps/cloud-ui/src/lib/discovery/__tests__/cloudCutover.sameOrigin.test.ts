import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import { DISCOVERY_TEST_ROUTE, discoveryUrl } from '../../../__tests__/constants'
import { server } from '../../../__tests__/setup'
import discovery from '../index'
import {
  makeEditorPickPodcast,
  makeMinimalPodcast,
  makePodcast,
  makeTopEpisode,
  makeTopPodcast,
} from './fixtures'

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
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.topPodcasts), ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('country')).toBe('us')
        expect(url.searchParams.get('limit')).toBeNull()

        return HttpResponse.json([makeTopPodcast()])
      }),
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.topEpisodes), ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('country')).toBe('us')
        expect(url.searchParams.get('limit')).toBeNull()

        return HttpResponse.json([makeTopEpisode()])
      })
    )

    const topPodcasts = await discovery.fetchTopPodcasts('us')
    const topEpisodes = await discovery.fetchTopEpisodes('us')

    expect(topPodcasts).toHaveLength(1)
    expect(topPodcasts[0]?.podcastItunesId).toBe('top-1')
    expect(topEpisodes).toHaveLength(1)
    expect(topEpisodes[0]?.podcastItunesId).toBe('123')
    expect(appleLookupHits).toBe(0)
  })

  it('accepts empty genres for apple chart first-hop payloads', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.topPodcasts), () =>
        HttpResponse.json([makeTopPodcast({ genres: [] })])
      ),
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.topEpisodes), () =>
        HttpResponse.json([makeTopEpisode({ genres: [] })])
      )
    )

    const topPodcasts = await discovery.fetchTopPodcasts('us')
    const topEpisodes = await discovery.fetchTopEpisodes('us')

    expect(topPodcasts[0]?.genres).toEqual([])
    expect(topEpisodes[0]?.genres).toEqual([])
    expect(appleLookupHits).toBe(0)
  })

  it('uses explicit PI same-origin endpoint for podcast detail lookups', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastByItunesId('123')), ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('country')).toBeNull()

        return HttpResponse.json(
          makeMinimalPodcast({
            podcastItunesId: '123',
            title: 'JP Podcast',
            author: 'JP Host',
            artwork: 'https://example.com/jp-art-600.jpg',
            feedUrl: normalizeFeedUrl('https://example.com/jp-feed.xml'),
            genres: ['Technology'],
            episodeCount: 30,
            lastUpdateTime: 1613394044,
            language: 'en',
          })
        )
      })
    )

    const podcast = await discovery.getPodcastIndexPodcastByItunesId('123')

    expect(podcast?.title).toBe('JP Podcast')
    expect(appleLookupHits).toBe(0)
  })

  it('accepts PI podcast payloads with missing optional metadata', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastByItunesId('123')), () =>
        HttpResponse.json(
          makeMinimalPodcast({
            podcastItunesId: '123',
            title: 'JP Podcast',
            author: 'JP Host',
            artwork: 'https://example.com/jp-art-600.jpg',
            feedUrl: normalizeFeedUrl('https://example.com/jp-feed.xml'),
          })
        )
      )
    )

    const podcast = await discovery.getPodcastIndexPodcastByItunesId('123')

    expect(podcast?.title).toBe('JP Podcast')
    expect(podcast?.genres).toEqual([])
    expect(podcast?.lastUpdateTime).toBeUndefined()
    expect(podcast?.episodeCount).toBeUndefined()
    expect(podcast?.language).toBeUndefined()
    expect(appleLookupHits).toBe(0)
  })

  it('uses same-origin discovery endpoint for editor pick guid batch lookup', async () => {
    server.use(
      http.post(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastsBatch), async ({ request }) => {
        expect(await request.json()).toEqual([
          '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
          'f1ebeaa1-bc5a-534f-8528-0738ae374d55',
        ])

        return HttpResponse.json([
          makeEditorPickPodcast({
            title: 'The Daily',
            feedUrl: normalizeFeedUrl('https://example.com/daily.xml'),
            author: 'NYT',
            description: 'Daily news',
            artwork: 'https://example.com/daily.jpg',
            lastUpdateTime: 1613394044,
            genres: ['News'],
            podcastItunesId: '1200361736',
            episodeCount: 500,
          }),
          makeEditorPickPodcast({
            title: 'This American Life',
            feedUrl: normalizeFeedUrl('https://example.com/tal.xml'),
            author: 'TAL',
            description: 'Stories',
            artwork: 'https://example.com/tal.jpg',
            lastUpdateTime: 1613395200,
            genres: ['Society'],
            podcastItunesId: '201671138',
            episodeCount: 800,
          }),
        ])
      })
    )

    const podcasts = await discovery.getPodcastIndexPodcastsBatchByGuid([
      '304b84f0-07b0-5265-b6b7-da5cf5aeb56e',
      'f1ebeaa1-bc5a-534f-8528-0738ae374d55',
    ])

    expect(podcasts).toHaveLength(2)
    expect(podcasts[0]?.podcastItunesId).toBe('1200361736')
    expect(podcasts[0]?.artwork).toBe('https://example.com/daily.jpg')
    expect(podcasts[0]?.lastUpdateTime).toBe(1613394044)
    expect(podcasts[0]?.genres).toEqual(['News'])
    expect(appleLookupHits).toBe(0)
  })

  it('uses same-origin discovery endpoint for show lookup by podcastItunesId', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastByItunesId('1200361736')), () => {
        return HttpResponse.json(
          makePodcast({
            podcastItunesId: '1200361736',
            title: 'The Daily',
            author: 'NYT',
            description: 'Daily news',
            artwork: 'https://example.com/show-600.jpg',
            feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
            lastUpdateTime: 1613394044,
            genres: ['News'],
            episodeCount: 42,
          })
        )
      })
    )

    const podcast = await discovery.getPodcastIndexPodcastByItunesId('1200361736')

    expect(podcast?.title).toBe('The Daily')
    expect(podcast?.podcastItunesId).toBe('1200361736')
    expect(podcast?.lastUpdateTime).toBe(1613394044)
    expect(podcast?.podcastItunesId).toBe('1200361736')
    expect(appleLookupHits).toBe(0)
  })
})
