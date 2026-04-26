import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { DISCOVERY_TEST_ROUTE, discoveryUrl } from '../../../__tests__/constants'
import { server } from '../../../__tests__/setup'
import discovery from '../index'
import { makeSearchEpisode, makeSearchPodcast } from './fixtures'

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
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.searchPodcasts), ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('term')).toBe('tech')
        expect(url.searchParams.get('country')).toBe('us')
        expect(url.searchParams.has('limit')).toBe(false)

        return HttpResponse.json([makeSearchPodcast({ podcastItunesId: '123' })])
      })
    )

    const results = await discovery.searchPodcasts('tech', 'us')

    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('Tech Podcast')
    expect(results[0]?.podcastItunesId).toBe('123')
    expect(results[0]?.releaseDate).toBe('2026-03-27T00:00:00.000Z')
    expect(results[0]?.episodeCount).toBe(321)
    expect(appleSearchHits).toBe(0)
  })

  it('uses same-origin endpoint for episode search', async () => {
    server.use(
      http.get(discoveryUrl(DISCOVERY_TEST_ROUTE.searchEpisodes), ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('term')).toBe('history')
        expect(url.searchParams.get('country')).toBe('jp')
        expect(url.searchParams.has('limit')).toBe(false)

        return HttpResponse.json([
          makeSearchEpisode({
            title: 'History Episode',
            showTitle: 'History Show',
            artwork: 'https://example.com/history-600.jpg',
            episodeUrl: 'https://example.com/history.mp3',
            episodeGuid: 'guid-123',
            podcastItunesId: '123',
          }),
        ])
      })
    )

    const results = await discovery.searchEpisodes('history', 'jp')

    expect(results).toHaveLength(1)
    expect(results[0]?.title).toBe('History Episode')
    expect(results[0]?.podcastItunesId).toBe('123')
    expect(appleSearchHits).toBe(0)
  })
})
