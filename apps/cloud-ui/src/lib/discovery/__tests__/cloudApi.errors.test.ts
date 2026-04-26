import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { DISCOVERY_TEST_ROUTE, discoveryUrl } from '../../../__tests__/constants'
import { server } from '../../../__tests__/setup'
import { fetchPodcastFeed, fetchTopPodcasts, getPodcastIndexPodcastsBatchByGuid } from '../cloudApi'

describe('cloudApi discovery error mapping', () => {
  beforeEach(() => {
    server.resetHandlers()
  })

  it('throws DiscoveryParseError with method and path context for invalid JSON', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.topPodcasts), () => {
        return new HttpResponse('not-json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )

    await expect(fetchTopPodcasts('us')).rejects.toThrow(
      'GET /api/v1/discovery/top-podcasts?country=us: invalid JSON response'
    )
  })

  it('throws DiscoveryInvalidPayloadError with method and path context for invalid POST payloads', async () => {
    server.use(
      http.post(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastsBatch), () =>
        HttpResponse.json({ not: 'an array' })
      )
    )

    await expect(getPodcastIndexPodcastsBatchByGuid(['guid-1'])).rejects.toMatchObject({
      name: 'DiscoveryInvalidPayloadError',
      message: 'POST /api/v1/discovery/podcasts/batch: discovery payload validation failed',
    })
  })

  it('throws FetchError with cloud-api error payload details for non-2xx discovery responses', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.topPodcasts), () =>
        HttpResponse.json(
          {
            code: 'rate_limited',
            message: 'too many requests',
            request_id: 'req_123',
          },
          { status: 429 }
        )
      )
    )

    await expect(fetchTopPodcasts('us')).rejects.toMatchObject({
      name: 'FetchError',
      message: 'too many requests',
      status: 429,
      code: 'rate_limited',
      requestId: 'req_123',
      url: '/api/v1/discovery/top-podcasts?country=us',
    })
  })

  it('falls back to generic FetchError when a non-2xx discovery response is not the standard error payload', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.topPodcasts), () =>
        HttpResponse.json({ error: 'bad gateway' }, { status: 502 })
      )
    )

    await expect(fetchTopPodcasts('us')).rejects.toMatchObject({
      name: 'FetchError',
      message: 'Cloud discovery request failed: 502',
      status: 502,
      code: undefined,
      requestId: undefined,
    })
  })

  it('fails closed when feed payload omits canonical episodeGuid', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.feed), () =>
        HttpResponse.json({
          title: 'Podcast',
          description: 'desc',
          artworkUrl: 'https://example.com/art.jpg',
          episodes: [
            {
              title: 'Episode without guid',
              description: 'desc',
              audioUrl: 'https://example.com/audio.mp3',
              pubDate: '2025-01-01T00:00:00Z',
            },
          ],
        })
      )
    )

    await expect(fetchPodcastFeed('https://example.com/feed.xml')).rejects.toMatchObject({
      name: 'DiscoveryInvalidPayloadError',
      message:
        'GET /api/v1/discovery/feed?url=https%3A%2F%2Fexample.com%2Ffeed.xml: discovery payload validation failed',
    })
  })
})
