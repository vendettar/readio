// src/libs/discoveryProvider.ts
/**
 * Discovery Podcast Service
 * Handles:
 * 1. Global Podcast RSS API (Top Charts, Rankings)
 * 2. Discovery Search API (Search, Metadata Lookup)
 * 3. RSS Feed Fetching & Parsing (XML feeds for audio playback)
 */

import { fetchJsonWithFallback, fetchTextWithFallback } from './fetchUtils'
import { deduplicatedFetch, getRequestKey } from './requestManager'
import { getJsonWithTtl, nsKey, setJsonWithTtl } from './storage'

// ========== Types & Interfaces ==========

/**
 * Common Podcast type used for Top Charts and internal references
 */
export interface DiscoveryPodcast {
  id: string
  name: string
  artistName: string
  artworkUrl100: string
  url: string // Original provider URL
  genres: { genreId: string; name: string; url: string }[]
  // Optional fields for Top Episodes
  description?: string
  releaseDate?: string // ISO date string
  duration?: number // Duration in milliseconds (from API)
  feedUrl?: string // Optional RSS feed URL (available for Editor's Picks/Lookup)
}

/**
 * Extended Podcast type returned by iTunes Search API
 */
export interface Podcast {
  collectionId: number
  collectionName: string
  artistName: string
  artworkUrl100: string
  artworkUrl600: string
  feedUrl: string
  collectionViewUrl: string
  genres: string[]
  artistId?: number
  primaryGenreName?: string
  trackCount?: number
}

/**
 * Episode result from iTunes Search API (entity=podcastEpisode)
 */
export interface SearchEpisode {
  trackId: number
  trackName: string
  collectionId: number
  collectionName: string
  artistName: string
  artworkUrl100: string
  artworkUrl600: string
  episodeUrl: string // audio URL
  episodeGuid?: string // RSS GUID discovered in the JSON!
  releaseDate: string // ISO date
  trackTimeMillis?: number // Duration in ms
  description?: string
  shortDescription?: string
  feedUrl?: string // Podcast RSS Feed URL (returned by iTunes Episode API)
}

export interface Episode {
  id: string
  title: string
  description: string // Plain text (stripped or from itunes:summary)
  descriptionHtml?: string // Rich HTML from content:encoded
  audioUrl: string
  pubDate: string
  artworkUrl?: string // Episode-specific artwork (fallback to show artwork)
  duration?: number // Duration in seconds
  // Extended metadata
  seasonNumber?: number // itunes:season
  episodeNumber?: number // itunes:episode
  episodeType?: 'full' | 'trailer' | 'bonus' // itunes:episodeType
  explicit?: boolean // itunes:explicit (yes/true = true)
  link?: string // <link> to original page
  fileSize?: number // enclosure length in bytes
  // Podcasting 2.0
  transcriptUrl?: string // podcast:transcript
  chaptersUrl?: string // podcast:chapters
}

export interface ParsedFeed {
  title: string
  description: string
  artworkUrl: string
  episodes: Episode[]
}

import { getAppConfig } from './runtimeConfig'

// ========== Constants & Config ==========

const EXPOSURE_API_PREFIX = 'readioDiscoveryV1'

function getConfig() {
  const config = getAppConfig()
  return {
    MEMORY_TTL_MS: config.CACHE_TTL_EPISODES_MS,
    CACHE_MAX_ENTRIES: 50, // Usually stable
    BASE_URLS: {
      RSS: config.RSS_FEED_BASE_URL,
      SEARCH: config.ITUNES_SEARCH_URL,
      LOOKUP: config.ITUNES_LOOKUP_URL,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memoryCache = new Map<string, { data: any; at: number }>()

function getCache<T>(key: string, ttl?: number): T | null {
  const { MEMORY_TTL_MS } = getConfig()
  const effectiveTtl = ttl ?? MEMORY_TTL_MS

  const entry = memoryCache.get(key)
  if (entry && Date.now() - entry.at < effectiveTtl) return entry.data as T

  // Fallback to storage
  const storageKey = nsKey(EXPOSURE_API_PREFIX, key)
  const storedData = getJsonWithTtl<T>(storageKey, effectiveTtl)
  if (storedData) {
    memoryCache.set(key, { data: storedData, at: Date.now() }) // Hydrate back to memory
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

// ========== 1. Top Charts (RSS API) ==========

export async function fetchTopPodcasts(
  country = 'us',
  limit = 30,
  signal?: AbortSignal
): Promise<DiscoveryPodcast[]> {
  const cacheKey = `top:${country}:${limit}`
  const cached = getCache<DiscoveryPodcast[]>(cacheKey)
  if (cached) return cached

  const { BASE_URLS } = getConfig()
  const url = `${BASE_URLS.RSS}/${country}/podcasts/top/${limit}/podcasts.json`
  return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
    const data = await fetchJsonWithFallback<{ feed?: { results?: unknown[] } }>(url, {
      signal: signal || fetchSignal,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data?.feed?.results || []).map((item) => mapRssResult(item as any))
    setCache(cacheKey, results)
    return results
  })
}

export async function fetchTopEpisodes(
  country = 'us',
  limit = 30,
  signal?: AbortSignal
): Promise<DiscoveryPodcast[]> {
  const cacheKey = `topEpisodes:${country}:${limit}`
  const cached = getCache<DiscoveryPodcast[]>(cacheKey)
  if (cached) return cached

  const { BASE_URLS } = getConfig()
  const url = `${BASE_URLS.RSS}/${country}/podcasts/top/${limit}/podcast-episodes.json`
  return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
    const data = await fetchJsonWithFallback<{ feed?: { results?: unknown[] } }>(url, {
      signal: signal || fetchSignal,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data?.feed?.results || []).map((item) => mapRssEpisodeResult(item as any))
    setCache(cacheKey, results)
    return results
  })
}

export async function fetchTopSubscriberPodcasts(
  country = 'us',
  limit = 30,
  signal?: AbortSignal
): Promise<DiscoveryPodcast[]> {
  const cacheKey = `topSubPodcasts:${country}:${limit}`
  const cached = getCache<DiscoveryPodcast[]>(cacheKey)
  if (cached) return cached

  const { BASE_URLS } = getConfig()
  const url = `${BASE_URLS.RSS}/${country}/podcasts/top-subscriber/${limit}/podcasts.json`
  return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
    const data = await fetchJsonWithFallback<{ feed?: { results?: unknown[] } }>(url, {
      signal: signal || fetchSignal,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data?.feed?.results || []).map((item) => mapRssResult(item as any))
    setCache(cacheKey, results)
    return results
  })
}

// ========== 2. Search & Lookup (iTunes API) ==========

export async function searchPodcasts(
  query: string,
  country = 'us',
  limit = 30,
  signal?: AbortSignal
): Promise<Podcast[]> {
  const cleanQuery = query.toLowerCase().trim()
  if (!cleanQuery) return []

  const cacheKey = `search:${country}:${cleanQuery}`
  const cached = getCache<Podcast[]>(cacheKey, 30 * 60 * 1000) // 30 min shorter TTL for search
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data?.results || []).map((item) => mapITunesResult(item as any))
    setCache(cacheKey, results)
    return results
  })
}

export async function searchEpisodes(
  query: string,
  country = 'us',
  limit = 20,
  signal?: AbortSignal
): Promise<SearchEpisode[]> {
  const cleanQuery = query.toLowerCase().trim()
  if (!cleanQuery) return []

  const cacheKey = `searchEp:${country}:${cleanQuery}`
  const cached = getCache<SearchEpisode[]>(cacheKey, 30 * 60 * 1000) // 30 min TTL
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data?.results || []).map((item) => mapITunesEpisodeResult(item as any))
    setCache(cacheKey, results)
    return results
  })
}

export async function lookupPodcastsByIds(
  ids: string[],
  country = 'us',
  signal?: AbortSignal
): Promise<DiscoveryPodcast[]> {
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
    const results = (data?.results || [])
      .filter((r: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = r as any
        return (
          item.kind === 'podcast' ||
          item.wrapperType === 'collection' ||
          item.wrapperType === 'track'
        )
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item) => mapLookupResult(item as any))
    setCache(cacheKey, results)
    return results
  })
}

export async function lookupPodcastFull(
  id: string,
  country = 'us',
  signal?: AbortSignal
): Promise<Podcast> {
  const cacheKey = `lookupFull:${country}:${id}`
  const cached = getCache<Podcast>(cacheKey)
  if (cached) return cached

  const { BASE_URLS } = getConfig()
  const url = `${BASE_URLS.LOOKUP}?id=${id}&country=${country}&entity=podcast`
  return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
    const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
      signal: signal || fetchSignal,
    })
    // iTunes API returns wrapperType='track' with kind='podcast' for single podcast lookup
    // OR wrapperType='collection' for collection lookups
    const result = (data?.results || [])
      .filter((r: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = r as any
        return item.kind === 'podcast' || item.wrapperType === 'collection'
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item) => mapITunesResult(item as any))[0]
    if (!result) {
      throw new Error('Podcast not found')
    }
    setCache(cacheKey, result)
    return result
  })
}

/**
 * Lookup a single episode by its iTunes trackId
 * This is 100% accurate for Top Episodes from RSS API
 */
export async function lookupEpisode(
  trackId: string,
  country = 'us',
  signal?: AbortSignal
): Promise<SearchEpisode | null> {
  const cacheKey = `lookupEp:${country}:${trackId}`
  const cached = getCache<SearchEpisode>(cacheKey)
  if (cached) return cached

  const { BASE_URLS } = getConfig()
  const params = new URLSearchParams({ id: trackId, country, entity: 'podcastEpisode' })
  const url = `${BASE_URLS.LOOKUP}?${params}`

  return deduplicatedFetch(getRequestKey(url), async (fetchSignal) => {
    const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
      signal: signal || fetchSignal,
    })
    const results = data?.results || []
    if (results.length === 0) return null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const episode = mapITunesEpisodeResult(results[0] as any)
    setCache(cacheKey, episode)
    return episode
  })
}

/**
 * Fetch a list of episodes for a specific podcast using iTunes Lookup
 * This is the most reliable way to get both episode GUIDs and audio URLs
 */
export async function lookupPodcastEpisodes(
  podcastId: string,
  country = 'us',
  limit = 20,
  signal?: AbortSignal
): Promise<SearchEpisode[]> {
  const cacheKey = `lookupPodcastEps:${country}:${podcastId}:${limit}`
  const cached = getCache<SearchEpisode[]>(cacheKey)
  if (cached) return cached

  const { BASE_URLS } = getConfig()
  const params = new URLSearchParams({
    id: podcastId,
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

    // Filter out the podcast info (wrapperType='track' or 'collection') and keep episodes
    const episodes = (results as Array<Record<string, unknown>>)
      .filter((item) => item.wrapperType === 'podcastEpisode')
      .map((item) => mapITunesEpisodeResult(item))

    setCache(cacheKey, episodes)
    return episodes
  })
}

// ========== RSS Feed Fetching & Parsing ==========

export const fetchPodcastFeed = (feedUrl: string, signal?: AbortSignal) => {
  return deduplicatedFetch(getRequestKey(feedUrl), async (fetchSignal) => {
    const cacheTtl = 3600 * 24 * 1000 // 24h
    const cached = getJsonWithTtl<ParsedFeed>(nsKey('feed-v2', feedUrl), cacheTtl)
    if (cached) return cached

    const xmlText = await fetchTextWithFallback(feedUrl, { signal: signal || fetchSignal })
    const result = parseRssXml(xmlText)

    setJsonWithTtl(nsKey('feed-v2', feedUrl), result)
    return result
  })
}

function parseRssXml(xmlText: string): ParsedFeed {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  if (doc.querySelector('parsererror')) throw new Error('RSS parse failed')

  const channel = doc.querySelector('channel')
  const title = (channel?.querySelector('title')?.textContent || '').trim()
  const description = (channel?.querySelector('description')?.textContent || '').trim()

  // Helper to find tags with various namespace/prefix patterns
  const getNamespacedTag = (el: Element, prefix: string, tagName: string) => {
    // Try various common ways browsers represent prefix-tagged elements in DOMParser
    return (
      el.querySelector(`${prefix}\\:${tagName}`) ||
      el.getElementsByTagName(`${prefix}:${tagName}`)[0] ||
      el.getElementsByTagName(tagName)[0] ||
      Array.from(el.children).find(
        (c) =>
          c.tagName.toLowerCase() === `${prefix}:${tagName}`.toLowerCase() ||
          c.localName === tagName
      )
    )
  }

  const getITunesTag = (el: Element, tagName: string) => getNamespacedTag(el, 'itunes', tagName)
  const getPodcastTag = (el: Element, tagName: string) => getNamespacedTag(el, 'podcast', tagName)
  const getContentTag = (el: Element, tagName: string) => getNamespacedTag(el, 'content', tagName)

  const artworkUrl =
    getITunesTag(channel!, 'image')?.getAttribute('href') ||
    channel?.querySelector('image > url')?.textContent ||
    ''

  // Compare URLs without query parameters to avoid Simplecast/tracking differences
  const normalizeUrl = (u: string) => u.split('?')[0]
  // const isDefaultArtwork = normalizeUrl(episodeArtwork) === normalizeUrl(artworkUrl); // This line was part of the provided diff, but it's out of context here.

  const items = Array.from(doc.querySelectorAll('item'))
  const episodes: Episode[] = items
    .map((item): Episode | null => {
      const enclosure = item.querySelector('enclosure')
      const audioUrl = enclosure?.getAttribute('url') || ''
      if (!audioUrl) return null

      // Extract episode artwork
      const artworkEl = getITunesTag(item, 'image')
      const episodeArtwork = artworkEl?.getAttribute('href') || ''

      // Extract duration
      const durationEl = getITunesTag(item, 'duration')
      const durationStr = durationEl?.textContent?.trim() || ''

      let duration: number | undefined
      if (durationStr) {
        // Try parsing as HH:MM:SS or MM:SS
        if (durationStr.includes(':')) {
          const parts = durationStr.split(':').map((p) => parseInt(p, 10))
          if (parts.length === 3) {
            duration = parts[0] * 3600 + parts[1] * 60 + parts[2]
          } else if (parts.length === 2) {
            duration = parts[0] * 60 + parts[1]
          }
        } else {
          // Already in seconds
          duration = parseInt(durationStr, 10)
        }
      }

      // Compare URLs without query parameters to avoid Simplecast/tracking differences
      const isDefaultArtwork = normalizeUrl(episodeArtwork) === normalizeUrl(artworkUrl)

      // Extract season and episode numbers
      const seasonEl = getITunesTag(item, 'season')
      const episodeEl = getITunesTag(item, 'episode')
      const seasonNumber = seasonEl?.textContent ? parseInt(seasonEl.textContent, 10) : undefined
      const episodeNumber = episodeEl?.textContent ? parseInt(episodeEl.textContent, 10) : undefined

      // Extract episode type (full, trailer, bonus)
      const typeEl = getITunesTag(item, 'episodeType')
      const typeStr = typeEl?.textContent?.toLowerCase().trim()
      let episodeType: 'full' | 'trailer' | 'bonus' | undefined
      if (typeStr === 'trailer') episodeType = 'trailer'
      else if (typeStr === 'bonus') episodeType = 'bonus'
      else if (typeStr === 'full') episodeType = 'full'

      // Extract explicit flag
      const explicitEl = getITunesTag(item, 'explicit')
      const explicitStr = explicitEl?.textContent?.toLowerCase().trim()
      const explicit = explicitStr === 'yes' || explicitStr === 'true'

      // Extract link
      const linkEl = item.querySelector('link')
      const link = linkEl?.textContent?.trim() || undefined

      // Extract file size from enclosure
      const fileSizeStr = enclosure?.getAttribute('length')
      const fileSize = fileSizeStr ? parseInt(fileSizeStr, 10) : undefined

      // Extract rich HTML description (content:encoded)
      const contentEncodedEl = getContentTag(item, 'encoded')
      const descriptionHtml = contentEncodedEl?.textContent?.trim() || undefined

      // Extract Podcasting 2.0 transcript and chapters
      const transcriptEl = getPodcastTag(item, 'transcript')
      const chaptersEl = getPodcastTag(item, 'chapters')
      const transcriptUrl = transcriptEl?.getAttribute('url') || undefined
      const chaptersUrl = chaptersEl?.getAttribute('url') || undefined

      return {
        id: (item.querySelector('guid')?.textContent || audioUrl).trim(),
        title: item.querySelector('title')?.textContent || 'Untitled Episode',
        description: (
          getITunesTag(item, 'summary')?.textContent ||
          item.querySelector('description')?.textContent ||
          ''
        ).trim(),
        descriptionHtml,
        audioUrl,
        pubDate: item.querySelector('pubDate')?.textContent || '',
        artworkUrl: episodeArtwork && !isDefaultArtwork ? episodeArtwork : undefined,
        duration,
        seasonNumber: Number.isNaN(seasonNumber!) ? undefined : seasonNumber,
        episodeNumber: Number.isNaN(episodeNumber!) ? undefined : episodeNumber,
        episodeType,
        explicit: explicit || undefined, // Only set if true
        link,
        fileSize: Number.isNaN(fileSize!) ? undefined : fileSize,
        transcriptUrl,
        chaptersUrl,
      }
    })
    .filter((e): e is Episode => e !== null)

  return { title, description, artworkUrl, episodes }
}

// ========== Mapping Helpers ==========

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRssResult(item: any): DiscoveryPodcast {
  return {
    id: String(item.id || ''),
    name: item.name || '',
    artistName: item.artistName || '',
    artworkUrl100: item.artworkUrl100 || '',
    url: item.url || '',
    genres: Array.isArray(item.genres) ? item.genres : [],
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRssEpisodeResult(item: any): DiscoveryPodcast {
  return {
    id: String(item.id || ''),
    name: item.name || '',
    artistName: item.artistName || '',
    artworkUrl100: item.artworkUrl100 || '',
    url: item.url || '',
    genres: [],
    description: item.description || '',
    releaseDate: item.releaseDate || '',
    duration: item.duration || undefined, // Duration in milliseconds from API
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapITunesResult(item: any): Podcast {
  return {
    collectionId: item.collectionId || 0,
    // Fallback: use trackName if collectionName is missing
    collectionName: item.collectionName || item.trackName || '',
    artistName: item.artistName || '',
    artworkUrl100: item.artworkUrl100 || '',
    artworkUrl600: item.artworkUrl600 || '',
    feedUrl: item.feedUrl || '',
    collectionViewUrl: item.collectionViewUrl || '',
    genres: item.genres || [],
    artistId: item.artistId,
    primaryGenreName: item.primaryGenreName,
    trackCount: item.trackCount,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapITunesEpisodeResult(item: any): SearchEpisode {
  // iTunes Episode API returns: artworkUrl60, artworkUrl160, artworkUrl600 (NOT artworkUrl100)
  // We use artworkUrl160 as the "100" equivalent for consistency with Podcast API
  const artworkUrl100 = item.artworkUrl160 || item.artworkUrl60 || ''
  const artworkUrl600 = item.artworkUrl600 || artworkUrl100

  return {
    trackId: item.trackId || 0,
    // Fallback: use collectionName if trackName is missing (for episodes)
    trackName: item.trackName || item.collectionName || '',
    collectionId: item.collectionId || 0,
    // Fallback: use trackName if collectionName is missing (for podcast name)
    collectionName: item.collectionName || item.trackName || '',
    artistName: item.artistName || '',
    artworkUrl100,
    artworkUrl600,
    episodeUrl: item.episodeUrl || '',
    episodeGuid: item.episodeGuid,
    releaseDate: item.releaseDate || '',
    trackTimeMillis: item.trackTimeMillis,
    description: item.description || item.shortDescription || '',
    shortDescription: item.shortDescription || '',
    feedUrl: item.feedUrl,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLookupResult(item: any): DiscoveryPodcast {
  return {
    id: String(item.collectionId || ''),
    name: item.collectionName || '',
    artistName: item.artistName || '',
    artworkUrl100: item.artworkUrl100 || '',
    url: item.collectionViewUrl || '',
    genres: (item.genres || []).map((name: string, i: number) => ({
      genreId: String(i),
      name,
      url: '',
    })),
    feedUrl: item.feedUrl,
  }
}
