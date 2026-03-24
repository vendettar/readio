import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchJsonWithFallbackMock, fetchTextWithFallbackMock } = vi.hoisted(() => ({
  fetchJsonWithFallbackMock: vi.fn(),
  fetchTextWithFallbackMock: vi.fn(),
}))

vi.mock('../../fetchUtils', () => ({
  fetchJsonWithFallback: fetchJsonWithFallbackMock,
  fetchTextWithFallback: fetchTextWithFallbackMock,
}))

vi.mock('../../runtimeConfig', () => ({
  getAppConfig: () => ({
    RSS_FEED_BASE_URL: 'https://rss.test',
    DISCOVERY_SEARCH_URL: 'https://search.test',
    DISCOVERY_LOOKUP_URL: 'https://lookup.test',
    CACHE_TTL_EPISODES_MS: 60 * 60 * 1000,
    MAX_CONCURRENT_REQUESTS: 8,
  }),
}))

import { normalizeFeedUrl, normalizeFeedUrlOrUndefined } from '../feedUrl'
import {
  __countDiscoveryPersistedCachesForTests,
  __readDiscoveryCacheForTests,
  __readDiscoveryPersistedCacheForTests,
  __resetDiscoveryCacheForTests,
  __setDiscoveryCacheForTests,
  __setDiscoveryMemoryCacheForTests,
  appleProvider,
  DISCOVERY_CACHE_KEY_BUILDERS,
  runDiscoveryCacheMaintenance,
} from '../providers/apple'

const ONE_DAY_MS = 24 * 60 * 60 * 1000
const THIRTY_MIN_MS = 30 * 60 * 1000
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000
const EIGHT_DAYS_MS = 8 * ONE_DAY_MS

const DISCOVERY_24H_PROFILE = { namespace: 'readioDiscoveryV1' as const, ttlMs: ONE_DAY_MS }

function makeTopResult(id: string) {
  return {
    id,
    name: `Show ${id}`,
    artistName: `Host ${id}`,
    artworkUrl100: 'https://example.com/art.jpg',
    url: `https://example.com/show/${id}`,
    genres: [{ genreId: '1', name: 'News', url: 'https://example.com/genre/news' }],
  }
}

function makePodcastLookupResult(id: number) {
  return {
    collectionId: id,
    collectionName: `Podcast ${id}`,
    artistName: 'Host',
    artworkUrl100: 'https://example.com/podcast-100.jpg',
    artworkUrl600: 'https://example.com/podcast-600.jpg',
    feedUrl: `https://example.com/feed-${id}.xml`,
    collectionViewUrl: `https://example.com/podcast/${id}`,
    wrapperType: 'collection',
    kind: 'podcast',
  }
}

function makeLookupEpisodeResult(id: number) {
  return {
    wrapperType: 'podcastEpisode',
    trackId: id,
    collectionId: 100,
    trackName: `Episode ${id}`,
    collectionName: 'Podcast',
    episodeUrl: `https://example.com/audio-${id}.mp3`,
    releaseDate: '2024-01-01T00:00:00.000Z',
    artworkUrl160: 'https://example.com/ep-160.jpg',
    artworkUrl600: 'https://example.com/ep-600.jpg',
    feedUrl: 'https://example.com/feed.xml',
  }
}

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('appleProvider discovery cache behavior', () => {
  beforeEach(async () => {
    fetchJsonWithFallbackMock.mockReset()
    fetchTextWithFallbackMock.mockReset()
    localStorage.clear()
    await __resetDiscoveryCacheForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns stale cache immediately and overwrites on successful revalidation', async () => {
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 25)
    const staleData = [makeTopResult('stale')]
    const freshData = [makeTopResult('fresh')]
    await __setDiscoveryCacheForTests(
      cacheKey,
      DISCOVERY_24H_PROFILE,
      staleData,
      Date.now() - EIGHT_DAYS_MS
    )

    fetchJsonWithFallbackMock.mockResolvedValueOnce({
      feed: { results: freshData },
    })

    const result = await appleProvider.fetchTopPodcasts('us', 25)
    expect(result[0]?.id).toBe('stale')

    await flushAsyncWork()

    const readResult = await __readDiscoveryCacheForTests<(typeof staleData)[number][]>(cacheKey, {
      namespace: 'readioDiscoveryV1',
      ttlMs: ONE_DAY_MS,
    })
    expect(readResult.status).toBe('fresh')
    expect(readResult.data?.[0]?.id).toBe('fresh')
  })

  it('keeps stale payload when revalidation fails', async () => {
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 25)
    const staleData = [makeTopResult('stale')]
    await __setDiscoveryCacheForTests(
      cacheKey,
      DISCOVERY_24H_PROFILE,
      staleData,
      Date.now() - EIGHT_DAYS_MS
    )

    fetchJsonWithFallbackMock.mockRejectedValueOnce(new Error('upstream down'))

    const result = await appleProvider.fetchTopPodcasts('us', 25)
    expect(result[0]?.id).toBe('stale')

    await flushAsyncWork()

    const readResult = await __readDiscoveryCacheForTests<(typeof staleData)[number][]>(cacheKey, {
      namespace: 'readioDiscoveryV1',
      ttlMs: ONE_DAY_MS,
    })
    expect(readResult.status).toBe('stale')
    expect(readResult.data?.[0]?.id).toBe('stale')
  })

  it('writes cache on miss after successful network response', async () => {
    fetchJsonWithFallbackMock.mockResolvedValueOnce({
      feed: { results: [makeTopResult('net')] },
    })

    const result = await appleProvider.fetchTopPodcasts('us', 25)
    expect(result[0]?.id).toBe('net')

    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 25)
    const readResult = await __readDiscoveryCacheForTests<typeof result>(cacheKey, {
      namespace: 'readioDiscoveryV1',
      ttlMs: ONE_DAY_MS,
    })
    expect(readResult.status).toBe('fresh')
    expect(readResult.data?.[0]?.id).toBe('net')
  })

  it('keeps country-specific keys isolated', async () => {
    await __setDiscoveryCacheForTests(
      DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 25),
      DISCOVERY_24H_PROFILE,
      [makeTopResult('us-only')],
      Date.now()
    )

    fetchJsonWithFallbackMock.mockResolvedValueOnce({
      feed: { results: [makeTopResult('jp-fresh')] },
    })

    const jpResult = await appleProvider.fetchTopPodcasts('jp', 25)
    expect(jpResult[0]?.id).toBe('jp-fresh')
    expect(fetchJsonWithFallbackMock).toHaveBeenCalledTimes(1)
  })

  it('keeps podcast search results when provider feedUrl is invalid by degrading feedUrl to undefined', async () => {
    fetchJsonWithFallbackMock.mockResolvedValueOnce({
      results: [
        {
          wrapperType: 'track',
          kind: 'podcast',
          collectionId: 1047335260,
          trackId: 1047335260,
          collectionName: 'The Ben Shapiro Show',
          artistName: 'The Daily Wire',
          artworkUrl100:
            'https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/ab/cd/ef/example.jpg/100x100bb.jpg',
          artworkUrl600:
            'https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/ab/cd/ef/example.jpg/600x600bb.jpg',
          collectionViewUrl:
            'https://podcasts.apple.com/us/podcast/the-ben-shapiro-show/id1047335260',
          feedUrl: 'not-a-valid-url',
        },
      ],
    })

    const result = await appleProvider.searchPodcasts('ben shapiro', 'us', 20)

    expect(result).toHaveLength(1)
    expect(result[0]?.providerPodcastId).toBe(1047335260)
    expect(result[0]?.feedUrl).toBeUndefined()
  })

  it('does not cleanup storage during read phase before write/revalidation success', async () => {
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 25)
    await __setDiscoveryCacheForTests(
      cacheKey,
      DISCOVERY_24H_PROFILE,
      [makeTopResult('stale')],
      Date.now()
    )
    const beforeCount = await __countDiscoveryPersistedCachesForTests()

    fetchJsonWithFallbackMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ feed: { results: [makeTopResult('fresh')] } }), 20)
        })
    )

    await appleProvider.fetchTopPodcasts('us', 25)

    expect(await __countDiscoveryPersistedCachesForTests()).toBe(beforeCount)
    expect(
      await __readDiscoveryPersistedCacheForTests(cacheKey, DISCOVERY_24H_PROFILE)
    ).not.toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  it('deduplicates concurrent stale revalidations', async () => {
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 25)
    await __setDiscoveryCacheForTests(
      cacheKey,
      DISCOVERY_24H_PROFILE,
      [makeTopResult('stale')],
      Date.now() - EIGHT_DAYS_MS
    )

    fetchJsonWithFallbackMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ feed: { results: [makeTopResult('fresh')] } }), 10)
        })
    )

    await Promise.all([
      appleProvider.fetchTopPodcasts('us', 25),
      appleProvider.fetchTopPodcasts('us', 25),
    ])

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(fetchJsonWithFallbackMock).toHaveBeenCalledTimes(1)
  })

  it('keeps coalesced network request alive when one caller aborts', async () => {
    fetchJsonWithFallbackMock.mockImplementationOnce(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            { once: true }
          )

          setTimeout(() => {
            resolve({ feed: { results: [makeTopResult('coalesced')] } })
          }, 20)
        })
    )

    const firstCaller = new AbortController()
    const secondCaller = new AbortController()
    const firstPromise = appleProvider.fetchTopPodcasts('us', 31, firstCaller.signal)
    const secondPromise = appleProvider.fetchTopPodcasts('us', 31, secondCaller.signal)

    firstCaller.abort()

    await expect(firstPromise).rejects.toMatchObject({ name: 'AbortError' })
    await expect(secondPromise).resolves.toMatchObject([{ id: 'coalesced' }])
    expect(fetchJsonWithFallbackMock).toHaveBeenCalledTimes(1)
  })

  it('applies API TTL profiles: search=30m, lookupPodcastEpisodes=12h, feed=24h', async () => {
    fetchJsonWithFallbackMock
      .mockResolvedValueOnce({ results: [makePodcastLookupResult(100)] })
      .mockResolvedValueOnce({ results: [makeLookupEpisodeResult(200)] })
    fetchTextWithFallbackMock.mockResolvedValueOnce(`<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Sample</title>
          <description>Desc</description>
          <item>
            <guid>ep-1</guid>
            <title>Episode 1</title>
            <description>Episode 1 desc</description>
            <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
            <enclosure url="https://example.com/audio.mp3" length="1234" type="audio/mpeg" />
          </item>
        </channel>
      </rss>`)

    await appleProvider.searchPodcasts('podcast', 'us', 20)
    await appleProvider.lookupPodcastEpisodes('100', 'us', 50)
    await appleProvider.fetchPodcastFeed('https://example.com/feed.xml')

    const searchEnvelope = await __readDiscoveryPersistedCacheForTests(
      DISCOVERY_CACHE_KEY_BUILDERS.searchPodcasts('us', 'podcast', 20),
      { namespace: 'readioDiscoveryV1', ttlMs: ONE_DAY_MS }
    )
    const episodesEnvelope = await __readDiscoveryPersistedCacheForTests(
      DISCOVERY_CACHE_KEY_BUILDERS.lookupPodcastEpisodes('us', '100', 50),
      { namespace: 'readioDiscoveryV1', ttlMs: ONE_DAY_MS }
    )
    const feedEnvelope = await __readDiscoveryPersistedCacheForTests(
      normalizeFeedUrl('https://example.com/feed.xml'),
      { namespace: 'feed', ttlMs: ONE_DAY_MS }
    )

    expect(searchEnvelope?.ttlMs).toBe(THIRTY_MIN_MS)
    expect(episodesEnvelope?.ttlMs).toBe(TWELVE_HOURS_MS)
    expect(feedEnvelope?.ttlMs).toBe(ONE_DAY_MS)
  })

  it('normalizes feed cache key URL without stripping query params', () => {
    expect(normalizeFeedUrl(' HTTPS://Example.COM:443/feed.xml?x=1#frag ')).toBe(
      'https://example.com/feed.xml?x=1'
    )
    expect(normalizeFeedUrl('http://example.com:80/feed.xml?a=2')).toBe(
      'http://example.com/feed.xml?a=2'
    )
  })

  it('normalizes optional feed URL to undefined when empty or invalid', () => {
    expect(normalizeFeedUrlOrUndefined(undefined)).toBeUndefined()
    expect(normalizeFeedUrlOrUndefined('   ')).toBeUndefined()
    expect(normalizeFeedUrlOrUndefined('not-a-valid-url')).toBeUndefined()
    expect(normalizeFeedUrlOrUndefined(' HTTPS://Example.COM:443/feed.xml?x=1#frag ')).toBe(
      'https://example.com/feed.xml?x=1'
    )
  })

  it('uses feed cache key without country segments', () => {
    const keyA = DISCOVERY_CACHE_KEY_BUILDERS.fetchPodcastFeed(
      'HTTPS://Example.COM/feed.xml?x=1#frag'
    )
    const keyB = DISCOVERY_CACHE_KEY_BUILDERS.fetchPodcastFeed('https://example.com/feed.xml?x=1')
    expect(keyA).toBe(keyB)
    expect(keyA.includes(':us:')).toBe(false)
  })

  it('extracts podcast transcript/chapter URLs and keeps them through feed cache reads', async () => {
    const feedUrl = 'https://example.com/transcript-feed.xml'
    fetchTextWithFallbackMock.mockResolvedValueOnce(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:podcast="https://podcastindex.org/namespace/1.0">
        <channel>
          <title>Sample</title>
          <description>Desc</description>
          <item>
            <guid>ep-transcript-1</guid>
            <title>Episode 1</title>
            <description>Episode 1 desc</description>
            <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
            <enclosure url="https://example.com/audio.mp3" length="1234" type="audio/mpeg" />
            <podcast:transcript url="https://example.com/transcript.vtt" type="text/vtt" />
            <podcast:chapters url="https://example.com/chapters.json" type="application/json" />
          </item>
        </channel>
      </rss>`)

    const first = await appleProvider.fetchPodcastFeed(feedUrl)
    expect(first.episodes[0]?.transcriptUrl).toBe('https://example.com/transcript.vtt')
    expect(first.episodes[0]?.chaptersUrl).toBe('https://example.com/chapters.json')

    const second = await appleProvider.fetchPodcastFeed(feedUrl)
    expect(second.episodes[0]?.transcriptUrl).toBe('https://example.com/transcript.vtt')
    expect(second.episodes[0]?.chaptersUrl).toBe('https://example.com/chapters.json')
    expect(fetchTextWithFallbackMock).toHaveBeenCalledTimes(1)
  })

  it('evicts only over-retention entries deterministically when capacity pressure occurs', async () => {
    const now = Date.now()
    for (let i = 0; i < 58; i++) {
      await __setDiscoveryCacheForTests(
        `protected-${i}`,
        DISCOVERY_24H_PROFILE,
        { id: i },
        now - 60 * 1000
      )
    }
    await __setDiscoveryCacheForTests(
      'a-old',
      DISCOVERY_24H_PROFILE,
      { id: 'a-old' },
      now - EIGHT_DAYS_MS
    )
    await __setDiscoveryCacheForTests(
      'z-old',
      DISCOVERY_24H_PROFILE,
      { id: 'z-old' },
      now - EIGHT_DAYS_MS
    )

    fetchJsonWithFallbackMock.mockResolvedValueOnce({
      feed: { results: [makeTopResult('new')] },
    })

    await appleProvider.fetchTopPodcasts('us', 999)
    await flushAsyncWork()

    expect(await __readDiscoveryPersistedCacheForTests('a-old', DISCOVERY_24H_PROFILE)).toBeNull()
    expect(
      await __readDiscoveryPersistedCacheForTests('z-old', DISCOVERY_24H_PROFILE)
    ).not.toBeNull()
    expect(
      await __readDiscoveryPersistedCacheForTests(
        DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 999),
        DISCOVERY_24H_PROFILE
      )
    ).not.toBeNull()
  })

  it('skips IndexedDB write when capacity is full and all entries are protected', async () => {
    const now = Date.now()
    for (let i = 0; i < 60; i++) {
      await __setDiscoveryCacheForTests(
        `protected-${i}`,
        DISCOVERY_24H_PROFILE,
        { id: i },
        now - 60 * 1000
      )
    }
    const beforeCount = await __countDiscoveryPersistedCachesForTests()

    fetchJsonWithFallbackMock.mockResolvedValueOnce({
      feed: { results: [makeTopResult('fresh')] },
    })

    await appleProvider.fetchTopPodcasts('us', 123)
    await flushAsyncWork()

    expect(await __countDiscoveryPersistedCachesForTests()).toBe(beforeCount)
    expect(
      await __readDiscoveryPersistedCacheForTests(
        DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 123),
        DISCOVERY_24H_PROFILE
      )
    ).toBeNull()
  })

  it('applies fresh result in memory and triggers refresh callback when persistence is skipped', async () => {
    const now = Date.now()
    const key = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts('us', 123)
    for (let i = 0; i < 60; i++) {
      await __setDiscoveryCacheForTests(
        `protected-${i}`,
        DISCOVERY_24H_PROFILE,
        { id: i },
        now - 60 * 1000
      )
    }
    __setDiscoveryMemoryCacheForTests(
      key,
      DISCOVERY_24H_PROFILE,
      [makeTopResult('stale-memory-only')],
      now - EIGHT_DAYS_MS
    )

    const onBackgroundRefresh = vi.fn()
    fetchJsonWithFallbackMock.mockResolvedValueOnce({
      feed: { results: [makeTopResult('fresh-memory-only')] },
    })

    const staleResult = await appleProvider.fetchTopPodcasts('us', 123, undefined, {
      onBackgroundRefresh,
    })
    expect(staleResult[0]?.id).toBe('stale-memory-only')

    await flushAsyncWork()
    await vi.waitFor(() => {
      expect(onBackgroundRefresh).toHaveBeenCalledTimes(1)
    })
    expect(onBackgroundRefresh).toHaveBeenCalledWith([makeTopResult('fresh-memory-only')])
    expect(await __readDiscoveryPersistedCacheForTests(key, DISCOVERY_24H_PROFILE)).toBeNull()
  })

  it('runs explicit maintenance only through manual trigger function', async () => {
    const oldKey = 'manual-old'
    await __setDiscoveryCacheForTests(
      oldKey,
      DISCOVERY_24H_PROFILE,
      { id: 'old' },
      Date.now() - EIGHT_DAYS_MS
    )

    // Read path should not delete cache entries.
    const readBefore = await __readDiscoveryCacheForTests(oldKey, DISCOVERY_24H_PROFILE)
    expect(readBefore.status).toBe('stale')
    expect(
      await __readDiscoveryPersistedCacheForTests(oldKey, DISCOVERY_24H_PROFILE)
    ).not.toBeNull()

    await runDiscoveryCacheMaintenance()
    expect(await __readDiscoveryPersistedCacheForTests(oldKey, DISCOVERY_24H_PROFILE)).toBeNull()
  })
})
