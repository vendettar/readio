import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DISCOVERY_TEST_ROUTE, discoveryUrl } from '../../../__tests__/constants'
import { server } from '../../../__tests__/setup'
import { FetchError, NetworkError } from '../../fetchUtils'
import {
  DiscoveryInvalidPayloadError,
  DiscoveryParseError,
  fetchPodcastEpisodes,
  fetchTopPodcasts,
  getPodcastIndexPodcastsBatchByGuid,
  shouldRetryDiscoveryRequest,
} from '../cloudApi'

describe('cloudApi discovery error mapping', () => {
  beforeEach(() => {
    server.resetHandlers()
    window.__READIO_ENV__ = undefined
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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

  it('uses API_BASE_URL for decoupled Cloud discovery requests', async () => {
    window.__READIO_ENV__ = {
      VITE_API_BASE_URL: 'https://api-pre.readio.top',
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchTopPodcasts('us')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-pre.readio.top/api/v1/discovery/top-podcasts?country=us',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      })
    )
  })

  it('keeps discovery GET requests simple by omitting content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchTopPodcasts('us')

    const [, options] = fetchMock.mock.calls[0] ?? []
    expect(options).toMatchObject({
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
    expect((options as RequestInit).headers).not.toHaveProperty('Content-Type')
  })

  it('sends JSON content-type for discovery POST requests with a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await getPodcastIndexPodcastsBatchByGuid(['guid-1'])

    const [, options] = fetchMock.mock.calls[0] ?? []
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['guid-1']),
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

  it('fails closed when podcast episode payload omits required audioUrl', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.podcastEpisodesByItunesId('123')), () =>
        HttpResponse.json({
          episodes: [
            {
              guid: 'ep-1',
              title: 'Episode without audioUrl',
              description: 'desc',
              pubDate: 1735689600,
              artworkUrl: 'https://example.com/art.jpg',
              duration: 54,
              explicit: false,
              link: 'https://example.com/episode',
            },
          ],
        })
      )
    )

    await expect(fetchPodcastEpisodes('123')).rejects.toMatchObject({
      name: 'DiscoveryInvalidPayloadError',
      message: 'GET /api/v1/discovery/podcasts/123/episodes: discovery payload validation failed',
    })
  })
})

describe('cloudApi discovery retry taxonomy', () => {
  it('does not retry network errors', () => {
    expect(shouldRetryDiscoveryRequest(0, new NetworkError('offline'))).toBe(false)
  })

  it('does not retry parse or invalid-payload errors', () => {
    expect(shouldRetryDiscoveryRequest(0, new DiscoveryParseError('bad json'))).toBe(false)
    expect(
      shouldRetryDiscoveryRequest(0, new DiscoveryInvalidPayloadError('invalid payload'))
    ).toBe(false)
  })

  it('retries only first-attempt 5xx discovery fetch errors', () => {
    expect(
      shouldRetryDiscoveryRequest(
        0,
        new FetchError(
          'temporarily unavailable',
          '/api/v1/discovery/search/podcasts',
          503,
          'direct'
        )
      )
    ).toBe(true)

    expect(
      shouldRetryDiscoveryRequest(
        1,
        new FetchError(
          'temporarily unavailable',
          '/api/v1/discovery/search/podcasts',
          503,
          'direct'
        )
      )
    ).toBe(false)
  })

  it('does not retry non-5xx discovery fetch errors', () => {
    expect(
      shouldRetryDiscoveryRequest(
        0,
        new FetchError('not found', '/api/v1/discovery/search/podcasts', 404, 'direct')
      )
    ).toBe(false)

    expect(
      shouldRetryDiscoveryRequest(
        0,
        new FetchError('rate limited', '/api/v1/discovery/search/podcasts', 429, 'direct')
      )
    ).toBe(false)
  })
})
