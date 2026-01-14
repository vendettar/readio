import type { z } from 'zod'
import { fetchJsonWithFallback, fetchTextWithFallback } from '../../fetchUtils'
import { deduplicatedFetch, getRequestKey } from '../../requestManager'
import { getAppConfig } from '../../runtimeConfig'
import {
  DiscoveryPodcastSchema,
  EpisodeSchema,
  ParsedFeedSchema,
  PodcastSchema,
  SearchEpisodeSchema,
} from '../../schemas/discovery'
import { getJsonWithTtl, nsKey, setJsonWithTtl } from '../../storage'
import type {
  DiscoveryPodcast,
  DiscoveryProvider,
  Episode,
  ParsedFeed,
  Podcast,
  SearchEpisode,
} from './types'

interface RawGenreItem {
  genreId?: string | number
  name?: string
  url?: string
}

interface RawAppleItem {
  id?: string | number
  name?: string
  artistName?: string
  artworkUrl100?: string
  artworkUrl600?: string
  artworkUrl160?: string
  artworkUrl60?: string
  url?: string
  genres?: Array<RawGenreItem | string>
  description?: string
  shortDescription?: string
  releaseDate?: string
  duration?: number
  collectionId?: number
  collectionName?: string
  trackName?: string
  feedUrl?: string
  collectionViewUrl?: string
  artistId?: number
  primaryGenreName?: string
  trackCount?: number
  episodeUrl?: string
  episodeGuid?: string
  trackId?: number
  trackTimeMillis?: number
  wrapperType?: string
  kind?: string
}

// ========== Constants & Config ==========

const EXPOSURE_API_PREFIX = 'readioDiscoveryV1'

function getConfig() {
  const config = getAppConfig()
  return {
    MEMORY_TTL_MS: config.CACHE_TTL_EPISODES_MS,
    CACHE_MAX_ENTRIES: 50,
    BASE_URLS: {
      RSS: config.RSS_FEED_BASE_URL,
      SEARCH: config.DISCOVERY_SEARCH_URL,
      LOOKUP: config.DISCOVERY_LOOKUP_URL,
    },
  }
}

export const PODCAST_GENRES = [
  { id: '1489', name: 'News' },
  { id: '1303', name: 'Comedy' },
  { id: '1324', name: 'Society & Culture' },
  { id: '1321', name: 'Business' },
  { id: '1488', name: 'True Crime' },
  { id: '1545', name: 'Sports' },
  { id: '1512', name: 'Health & Fitness' },
  { id: '1314', name: 'Religion & Spirituality' },
  { id: '1301', name: 'Arts' },
  { id: '1304', name: 'Education' },
  { id: '1487', name: 'History' },
  { id: '1544', name: 'TV & Film' },
  { id: '1533', name: 'Science' },
  { id: '1318', name: 'Technology' },
  { id: '1310', name: 'Music' },
  { id: '1305', name: 'Kids & Family' },
  { id: '1502', name: 'Leisure' },
  { id: '1483', name: 'Fiction' },
  { id: '1511', name: 'Government' },
] as const

export type GenreId = (typeof PODCAST_GENRES)[number]['id']

export const COUNTRY_OPTIONS = [
  { code: 'us', label: 'US' },
  { code: 'cn', label: 'CN' },
  { code: 'jp', label: 'JP' },
  { code: 'kr', label: 'KR' },
  { code: 'de', label: 'DE' },
  { code: 'es', label: 'ES' },
  { code: 'sg', label: 'SG' },
]

// ========== Shared Cache Logic ==========

const memoryCache = new Map<string, { data: unknown; at: number }>()

function getCache<T>(key: string, ttl?: number): T | null {
  const { MEMORY_TTL_MS } = getConfig()
  const effectiveTtl = ttl ?? MEMORY_TTL_MS

  const entry = memoryCache.get(key)
  if (entry && Date.now() - entry.at < effectiveTtl) return entry.data as T

  const storageKey = nsKey(EXPOSURE_API_PREFIX, key)
  const storedData = getJsonWithTtl<T>(storageKey, effectiveTtl)
  if (storedData) {
    memoryCache.set(key, { data: storedData, at: Date.now() })
    return storedData
  }
  return null
}

function setCache<T>(key: string, data: T): void {
  const { CACHE_MAX_ENTRIES } = getConfig()
  if (memoryCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = memoryCache.keys().next().value
    if (oldest) memoryCache.delete(oldest)
  }
  const entry = { data, at: Date.now() }
  memoryCache.set(key, entry)
  setJsonWithTtl(nsKey(EXPOSURE_API_PREFIX, key), data)
}

function parseOrNull<T>(
  schema: z.ZodType<T>,
  data: unknown,
  tag: string,
  rawItem?: unknown
): T | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.warn(`[appleProvider] invalid ${tag}`, {
      error: result.error,
      data,
      rawItem,
    })
    return null
  }
  return result.data
}

// ========== Feed Parsing ==========

function sanitizeXml(xml: string): string {
  if (!xml) return ''
  return (
    xml
      // biome-ignore lint/suspicious/noControlCharactersInRegex: necessary for XML sanitization
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[a-f\d]+);)/gi, '&amp;')
  )
}

function parseRssXml(xmlText: string): ParsedFeed {
  const sanitized = sanitizeXml(xmlText)
  const parser = new DOMParser()
  const doc = parser.parseFromString(sanitized, 'text/xml')

  const parserError =
    doc.getElementsByTagName('parsererror')[0] ||
    (doc.documentElement.nodeName === 'parsererror' ? doc.documentElement : null)

  if (parserError) {
    const errorMsg = parserError.textContent || 'Unknown XML parse error'
    console.error('[parseRssXml] RSS parse failed:', errorMsg)
    throw new Error(`RSS parse failed: ${errorMsg.split('\n')[0]}`)
  }

  const channel = doc.querySelector('channel')
  if (!channel) {
    throw new Error('Invalid RSS: No <channel> found')
  }
  const title = (channel?.querySelector('title')?.textContent || '').trim()
  const description = (channel?.querySelector('description')?.textContent || '').trim()

  const getNamespacedTag = (el: Element, prefix: string, tagName: string) => {
    return (
      el.querySelector(`${prefix}\\:${tagName}`) ||
      el.getElementsByTagName(`${prefix}:${tagName}`)[0] ||
      el.getElementsByTagName(tagName)[0] ||
      Array.from(el.children).find(
        (c) =>
          c.tagName.toLowerCase() === `${prefix}:${tagName}`.toLowerCase() ||
          c.localName === tagName ||
          (c.prefix === prefix && c.localName === tagName)
      )
    )
  }

  const getITunesTag = (el: Element, tagName: string) => getNamespacedTag(el, 'itunes', tagName)
  const getPodcastTag = (el: Element, tagName: string) => getNamespacedTag(el, 'podcast', tagName)
  const getContentTag = (el: Element, tagName: string) => getNamespacedTag(el, 'content', tagName)

  const artworkUrl =
    getITunesTag(channel, 'image')?.getAttribute('href') ||
    channel?.querySelector('image > url')?.textContent ||
    ''

  const normalizeUrl = (u: string) => {
    if (!u) return ''
    const noQuery = u.split('?')[0]
    return noQuery.replace(/_\d+(\.[a-z]+)$/i, '$1')
  }
  const channelArtworkNormalized = normalizeUrl(artworkUrl)

  const items = Array.from(doc.querySelectorAll('item'))
  const initialEpisodes = items
    .map((item): Episode | null => {
      const enclosure = item.querySelector('enclosure')
      const audioUrl = enclosure?.getAttribute('url') || ''
      if (!audioUrl) return null

      const artworkEl = getITunesTag(item, 'image')
      const episodeArtwork = artworkEl?.getAttribute('href') || ''
      const isDefaultArtwork =
        episodeArtwork && normalizeUrl(episodeArtwork) === channelArtworkNormalized

      const durationEl = getITunesTag(item, 'duration')
      const durationStr = durationEl?.textContent?.trim() || ''

      let duration: number | undefined
      if (durationStr) {
        if (durationStr.includes(':')) {
          const parts = durationStr.split(':').map((p) => parseInt(p, 10))
          if (parts.length === 3) {
            duration = parts[0] * 3600 + parts[1] * 60 + parts[2]
          } else if (parts.length === 2) {
            duration = parts[0] * 60 + parts[1]
          }
        } else {
          duration = parseInt(durationStr, 10)
        }
      }

      const seasonEl = getITunesTag(item, 'season')
      const episodeEl = getITunesTag(item, 'episode')
      const seasonNumber = seasonEl?.textContent ? parseInt(seasonEl.textContent, 10) : undefined
      const episodeNumber = episodeEl?.textContent ? parseInt(episodeEl.textContent, 10) : undefined

      const typeEl = getITunesTag(item, 'episodeType')
      const typeStr = typeEl?.textContent?.toLowerCase().trim()
      let episodeType: 'full' | 'trailer' | 'bonus' | undefined
      if (typeStr === 'trailer') episodeType = 'trailer'
      else if (typeStr === 'bonus') episodeType = 'bonus'
      else if (typeStr === 'full') episodeType = 'full'

      const explicitEl = getITunesTag(item, 'explicit')
      const explicitStr = explicitEl?.textContent?.toLowerCase().trim()
      const explicit = explicitStr === 'yes' || explicitStr === 'true'

      const linkEl = item.querySelector('link')
      const link = linkEl?.textContent?.trim() || undefined

      const fileSizeStr = enclosure?.getAttribute('length')
      const fileSize = fileSizeStr ? parseInt(fileSizeStr, 10) : undefined

      const contentEncodedEl = getContentTag(item, 'encoded')
      const encodedContent = contentEncodedEl?.textContent?.trim() || ''

      const descriptionEl = item.querySelector('description')
      const descriptionContent = descriptionEl?.textContent?.trim() || ''

      const summaryEl = getITunesTag(item, 'summary')
      const summaryContent = summaryEl?.textContent?.trim() || ''

      // Heuristic for best description:
      // 1. If encodedContent (content:encoded) exists, it's usually the best HTML source.
      // 2. If not, check if regular description has HTML tags (like <p>, <br>, <a>).
      // 3. Fallback to longest available text.

      let descriptionHtml: string | undefined
      let finalDescription = ''

      if (encodedContent) {
        descriptionHtml = encodedContent
        finalDescription = encodedContent
      } else if (
        descriptionContent.includes('<p') ||
        descriptionContent.includes('<br') ||
        descriptionContent.includes('<a ')
      ) {
        descriptionHtml = descriptionContent
        finalDescription = descriptionContent
      } else {
        // Plain text fallback - pick the longest one
        finalDescription =
          descriptionContent.length >= summaryContent.length ? descriptionContent : summaryContent
      }

      const transcriptEl = getPodcastTag(item, 'transcript')
      const chaptersEl = getPodcastTag(item, 'chapters')
      const transcriptUrl = transcriptEl?.getAttribute('url') || undefined
      const chaptersUrl = chaptersEl?.getAttribute('url') || undefined

      const episodeData = {
        id: (item.querySelector('guid')?.textContent || audioUrl || '').trim(),
        title: item.querySelector('title')?.textContent?.trim(),
        description: finalDescription,
        descriptionHtml,
        audioUrl,
        pubDate: item.querySelector('pubDate')?.textContent?.trim(),
        artworkUrl: episodeArtwork && !isDefaultArtwork ? episodeArtwork : undefined,
        duration,
        seasonNumber:
          seasonNumber === null || Number.isNaN(seasonNumber) ? undefined : seasonNumber,
        episodeNumber:
          episodeNumber === null || Number.isNaN(episodeNumber) ? undefined : episodeNumber,
        episodeType,
        explicit: explicit || undefined,
        link,
        fileSize: fileSize === null || Number.isNaN(fileSize) ? undefined : fileSize,
        transcriptUrl,
        chaptersUrl,
      }

      return parseOrNull(EpisodeSchema, episodeData, 'episode in RSS', item)
    })
    .filter((e): e is Episode => e !== null)

  const feedData = { title, description, artworkUrl, episodes: initialEpisodes }
  const feed = parseOrNull(ParsedFeedSchema, feedData, 'feed schema')
  if (!feed) {
    throw new Error('Invalid feed schema')
  }

  return feed
}

// ========== Mapping Functions ==========

function mapRssResult(item: RawAppleItem): DiscoveryPodcast | null {
  const data = {
    id: item.id ? String(item.id) : undefined,
    name: item.name,
    artistName: item.artistName,
    artworkUrl100: item.artworkUrl100,
    url: item.url,
    genres: Array.isArray(item.genres)
      ? item.genres.map((g, i: number) => {
          if (typeof g === 'string') {
            return { genreId: String(i), name: g, url: undefined }
          }
          const gObj = g as RawGenreItem
          const genreId = String(gObj.genreId ?? i)
          const rawName = typeof gObj.name === 'string' ? gObj.name.trim() : ''
          return {
            genreId,
            name: rawName || genreId,
            url: gObj.url,
          }
        })
      : [],
  }
  return parseOrNull(DiscoveryPodcastSchema, data, 'RSS podcast', item)
}

function mapRssEpisodeResult(item: RawAppleItem): DiscoveryPodcast | null {
  const data = {
    id: item.id ? String(item.id) : undefined,
    name: item.name,
    artistName: item.artistName,
    artworkUrl100: item.artworkUrl100,
    url: item.url,
    genres: [],
    description: item.description,
    releaseDate: item.releaseDate,
    duration: item.duration,
  }
  return parseOrNull(DiscoveryPodcastSchema, data, 'RSS episode', item)
}

function mapSearchResult(item: RawAppleItem): Podcast | null {
  const data = {
    providerPodcastId: item.collectionId,
    collectionName: item.collectionName || item.trackName,
    artistName: item.artistName,
    artworkUrl100: item.artworkUrl100,
    artworkUrl600: item.artworkUrl600,
    feedUrl: item.feedUrl,
    collectionViewUrl: item.collectionViewUrl,
    genres: item.genres,
    artistId: item.artistId,
    primaryGenreName: item.primaryGenreName,
    trackCount: item.trackCount,
  }
  return parseOrNull(PodcastSchema, data, 'provider podcast', item)
}

function mapSearchEpisodeResult(item: RawAppleItem): SearchEpisode | null {
  const artworkUrl100 = item.artworkUrl160 || item.artworkUrl60
  const artworkUrl600 = item.artworkUrl600 || artworkUrl100

  const data = {
    providerEpisodeId: item.trackId,
    trackName: item.trackName || item.collectionName,
    providerPodcastId: item.collectionId,
    collectionName: item.collectionName || item.trackName,
    artistName: item.artistName,
    artworkUrl100,
    artworkUrl600,
    episodeUrl: item.episodeUrl,
    episodeGuid: item.episodeGuid,
    releaseDate: item.releaseDate,
    trackTimeMillis: item.trackTimeMillis,
    description: item.description || item.shortDescription,
    shortDescription: item.shortDescription,
    feedUrl: item.feedUrl,
  }
  return parseOrNull(SearchEpisodeSchema, data, 'provider episode', item)
}

function mapLookupResult(item: RawAppleItem): DiscoveryPodcast | null {
  const data = {
    id: item.collectionId ? String(item.collectionId) : undefined,
    providerPodcastId: item.collectionId ? String(item.collectionId) : undefined,
    name: item.collectionName,
    artistName: item.artistName,
    artworkUrl100: item.artworkUrl100,
    url: item.collectionViewUrl,
    genres: Array.isArray(item.genres)
      ? item.genres.map((g, i: number) => {
          if (typeof g === 'string') {
            return { genreId: String(i), name: g, url: undefined }
          }
          const gObj = g as RawGenreItem
          const rawName = typeof gObj.name === 'string' ? gObj.name.trim() : ''
          return {
            genreId: gObj.genreId ? String(gObj.genreId) : String(i),
            name: rawName,
            url: gObj.url,
          }
        })
      : [],
    feedUrl: item.feedUrl,
  }
  return parseOrNull(DiscoveryPodcastSchema, data, 'lookup result', item)
}

export function mapSearchToEpisode(search: SearchEpisode): Episode | null {
  const data = {
    id: search.episodeGuid || String(search.providerEpisodeId),
    title: search.trackName,
    description: search.description || search.shortDescription || '',
    audioUrl: search.episodeUrl,
    pubDate: search.releaseDate,
    artworkUrl: search.artworkUrl600 || search.artworkUrl100,
    duration: search.trackTimeMillis ? search.trackTimeMillis / 1000 : undefined,
    itunesTrackId: String(search.providerEpisodeId),
    collectionName: search.collectionName,
    artistName: search.artistName,
    feedUrl: search.feedUrl,
  }
  return parseOrNull(EpisodeSchema, data, 'mapped from provider search')
}

// ========== Apple Provider Implementation ==========

const appleProviderImplementation: DiscoveryProvider = {
  id: 'apple',

  searchPodcasts: async (query, country, limit, signal) => {
    const cleanQuery = query.toLowerCase().trim()
    if (!cleanQuery) return []

    const cacheKey = `search:${country}:${cleanQuery}`
    const cached = getCache<Podcast[]>(cacheKey, 30 * 60 * 1000)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const params = new URLSearchParams({
      term: cleanQuery,
      country,
      media: 'podcast',
      limit: String(limit),
    })
    const url = `${BASE_URLS.SEARCH}?${params}`

    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
        signal: signal || fetchSignal,
      })
      const rawResults = (data?.results || []).map((item) => mapSearchResult(item as RawAppleItem))
      const results = rawResults.filter((r): r is Podcast => r !== null)
      setCache(cacheKey, results)
      return results
    })
  },

  searchEpisodes: async (query, country, limit, signal) => {
    const cleanQuery = query.toLowerCase().trim()
    if (!cleanQuery) return []

    const cacheKey = `searchEp:${country}:${cleanQuery}`
    const cached = getCache<SearchEpisode[]>(cacheKey, 30 * 60 * 1000)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const params = new URLSearchParams({
      term: cleanQuery,
      country,
      media: 'podcast',
      entity: 'podcastEpisode',
      limit: String(limit),
    })
    const url = `${BASE_URLS.SEARCH}?${params}`

    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
        signal: signal || fetchSignal,
      })
      const rawResults = (data?.results || []).map((item) =>
        mapSearchEpisodeResult(item as RawAppleItem)
      )
      const results = rawResults.filter((r): r is SearchEpisode => r !== null)
      setCache(cacheKey, results)
      return results
    })
  },

  lookupPodcast: async (id, country, signal) => {
    const cacheKey = `lookupFull:${country}:${id}`
    const cached = getCache<Podcast>(cacheKey)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const url = `${BASE_URLS.LOOKUP}?id=${id}&country=${country}&entity=podcast`
    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
        signal: signal || fetchSignal,
      })
      const result = (data?.results || [])
        .filter((r: unknown) => {
          const item = r as RawAppleItem
          return item.kind === 'podcast' || item.wrapperType === 'collection'
        })
        .map((item) => mapSearchResult(item as RawAppleItem))
        .filter((r): r is Podcast => r !== null)[0]
      if (!result) return null
      setCache(cacheKey, result)
      return result
    })
  },

  lookupPodcastEpisodes: async (id, country, limit, signal) => {
    const cacheKey = `lookupPodcastEpsV2:${country}:${id}:${limit}`
    const cached = getCache<Episode[]>(cacheKey)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const params = new URLSearchParams({
      id,
      country,
      entity: 'podcastEpisode',
      limit: String(limit),
    })
    const url = `${BASE_URLS.LOOKUP}?${params}`

    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
        signal: signal || fetchSignal,
      })
      const results = data?.results || []

      const episodes = (results as Array<Record<string, unknown>>)
        .filter((item) => item.wrapperType === 'podcastEpisode')
        .map((item) => {
          const searchEp = mapSearchEpisodeResult(item as RawAppleItem)
          return searchEp ? mapSearchToEpisode(searchEp) : null
        })
        .filter((e): e is Episode => e !== null)

      setCache(cacheKey, episodes)
      return episodes
    })
  },

  fetchPodcastFeed: async (feedUrl, signal) => {
    return deduplicatedFetch(getRequestKey(feedUrl), async (fetchSignal) => {
      const cacheTtl = 3600 * 24 * 1000
      const cached = getJsonWithTtl<ParsedFeed>(nsKey('feed-v2', feedUrl), cacheTtl)
      if (cached) return cached

      const xmlText = await fetchTextWithFallback(feedUrl, { signal: signal || fetchSignal })
      const result = parseRssXml(xmlText)

      setJsonWithTtl(nsKey('feed-v2', feedUrl), result)
      return result
    })
  },

  fetchTopPodcasts: async (country, limit, signal) => {
    const cacheKey = `top:${country}:${limit}`
    const cached = getCache<DiscoveryPodcast[]>(cacheKey)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const url = `${BASE_URLS.RSS}/${country}/podcasts/top/${limit}/podcasts.json`
    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ feed?: { results?: unknown[] } }>(url, {
        signal: signal || fetchSignal,
      })
      const rawResults = (data?.feed?.results || []).map((item) =>
        mapRssResult(item as RawAppleItem)
      )
      const results = rawResults.filter((r): r is DiscoveryPodcast => r !== null)
      setCache(cacheKey, results)
      return results
    })
  },

  fetchTopEpisodes: async (country, limit, signal) => {
    const cacheKey = `topEpisodes:${country}:${limit}`
    const cached = getCache<DiscoveryPodcast[]>(cacheKey)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const url = `${BASE_URLS.RSS}/${country}/podcasts/top/${limit}/podcast-episodes.json`
    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ feed?: { results?: unknown[] } }>(url, {
        signal: signal || fetchSignal,
      })
      const rawResults = (data?.feed?.results || []).map((item) =>
        mapRssEpisodeResult(item as RawAppleItem)
      )
      const results = rawResults.filter((r): r is DiscoveryPodcast => r !== null)
      setCache(cacheKey, results)
      return results
    })
  },

  fetchTopSubscriberPodcasts: async (_country, _limit, _signal) => {
    // Placeholder - Apple Provider expects Editor's Picks to be handled via lookupPodcastsByIds usually
    return []
  },

  lookupPodcastsByIds: async (ids: string[], country: string, signal?: AbortSignal) => {
    if (ids.length === 0) return []
    const cacheKey = `lookup:${country}:${ids.join(',')}`
    const cached = getCache<DiscoveryPodcast[]>(cacheKey)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const url = `${BASE_URLS.LOOKUP}?id=${ids.join(',')}&country=${country}&entity=podcast`
    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
        signal: signal || fetchSignal,
      })
      const rawResults = (data?.results || [])
        .filter((r: unknown) => {
          const item = r as RawAppleItem
          return (
            item.kind === 'podcast' ||
            item.wrapperType === 'collection' ||
            item.wrapperType === 'track'
          )
        })
        .map((item) => mapLookupResult(item as RawAppleItem))
      const results = rawResults.filter((r): r is DiscoveryPodcast => r !== null)
      setCache(cacheKey, results)
      return results
    })
  },

  lookupEpisode: async (episodeId: string, country: string, signal?: AbortSignal) => {
    const cacheKey = `lookupEpV2:${country}:${episodeId}`
    const cached = getCache<Episode>(cacheKey)
    if (cached) return cached

    const { BASE_URLS } = getConfig()
    const params = new URLSearchParams({ id: episodeId, country, entity: 'podcastEpisode' })
    const url = `${BASE_URLS.LOOKUP}?${params}`

    return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
      const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
        signal: signal || fetchSignal,
      })
      const results = data?.results || []
      if (results.length === 0) return null

      const searchEp = mapSearchEpisodeResult(results[0] as RawAppleItem)
      if (!searchEp) return null

      const episode = mapSearchToEpisode(searchEp)
      if (episode) {
        setCache(cacheKey, episode)
      }
      return episode
    })
  },
}
export const appleProvider = appleProviderImplementation
