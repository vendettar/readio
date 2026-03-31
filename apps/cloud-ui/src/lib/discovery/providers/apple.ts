import {
  DiscoveryPodcastSchema,
  EpisodeSchema,
  ParsedFeedSchema,
  PodcastSchema,
  SearchEpisodeSchema,
} from '@readio/core'
import { DB } from '../../dexieDb'
import { fetchJsonWithFallback, fetchTextWithFallback } from '../../fetchUtils'
import { log, logError, warn as logWarn } from '../../logger'
import { deduplicatedFetchWithCallerAbort, getRequestKey } from '../../requestManager'
import { getAppConfig } from '../../runtimeConfig'
import { nsKey } from '../../storage'
import { normalizeFeedUrl, normalizeFeedUrlOrUndefined } from '../feedUrl'
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
const FEED_CACHE_PREFIX = 'feed'
const DAY_MS = 24 * 60 * 60 * 1000
const SEARCH_TTL_MS = 30 * 60 * 1000
const PODCAST_EPISODES_TTL_MS = 12 * 60 * 60 * 1000
const DEFAULT_TTL_MS = DAY_MS
const HARD_RETENTION_BASE_MS = 7 * DAY_MS

export const DISCOVERY_CACHE_TTLS_MS = {
  searchPodcasts: SEARCH_TTL_MS,
  searchEpisodes: SEARCH_TTL_MS,
  lookupPodcast: DAY_MS,
  lookupPodcastEpisodes: PODCAST_EPISODES_TTL_MS,
  lookupEpisode: DAY_MS,
  fetchTopPodcasts: DAY_MS,
  fetchTopEpisodes: DAY_MS,
  lookupPodcastsByIds: DAY_MS,
  fetchPodcastFeed: DAY_MS,
} as const

export const DISCOVERY_CACHE_KEY_BUILDERS = {
  searchPodcasts: (country: string, query: string, limit: number) =>
    `search:${country}:${query}:${limit}`,
  searchEpisodes: (country: string, query: string, limit: number) =>
    `searchEp:${country}:${query}:${limit}`,
  lookupPodcast: (country: string, id: string) => `lookupFull:${country}:${id}`,
  lookupPodcastEpisodes: (country: string, id: string, limit: number) =>
    `lookupPodcastEpsV2:${country}:${id}:${limit}`,
  lookupEpisode: (country: string, episodeId: string) => `lookupEpV2:${country}:${episodeId}`,
  fetchTopPodcasts: (country: string, limit: number) => `top:${country}:${limit}`,
  fetchTopEpisodes: (country: string, limit: number) => `topEpisodes:${country}:${limit}`,
  lookupPodcastsByIds: (country: string, ids: string[]) => `lookup:${country}:${ids.join(',')}`,
  fetchPodcastFeed: (feedUrl: string) => normalizeFeedUrl(feedUrl),
} as const

type CacheNamespace = typeof EXPOSURE_API_PREFIX | typeof FEED_CACHE_PREFIX

interface CacheProfile {
  ttlMs: number
  namespace: CacheNamespace
}

type CacheReadStatus = 'fresh' | 'stale' | 'miss'

interface CacheEnvelope<T> {
  data: T
  at: number
  ttlMs?: number
}

interface CacheReadResult<T> {
  status: CacheReadStatus
  data?: T
  ageMs: number | null
}

interface CacheEntry<T> {
  data: T
  at: number
  ttlMs: number
}

interface CleanupCandidate {
  storageKey: string
  at: number
  ttlMs: number
}

interface WriteCacheResult {
  applied: boolean
  persisted: boolean
  reason: 'ok' | 'skipped_capacity' | 'skipped_newer_exists' | 'skipped_quota'
}

// English stop words and common terms to ignore during relevance check
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'by',
  'is',
  'it',
  'that',
  'this',
  'podcast',
  'audio',
  'episode',
  'episodes',
])

/**
 * Checks if a search result from Apple API is relevant to the user's query.
 *
 * Problem: Apple's Search API sometimes returns completely irrelevant "fallback" or "popular" results
 * when the search query has typos or low match confidence (e.g. searching "the kevin spacy trail"
 * returns "Fan Controlled TV").
 *
 * Solution: We implement a loose client-side filter.
 * Rule: The result's title or artist MUST contain at least one significant token from the query.
 * "Significant" means non-stopword tokens (ignoring 'the', 'podcast', etc.).
 */
function isRelevant(item: RawAppleItem, query: string): boolean {
  // 1. Tokenize query
  const tokens = query
    .toLowerCase()
    .split(/[\s,.!?;:'"()[\]{}]+/) // Split by common delimiters
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t)) // Filter short words and stop words

  // If no significant tokens remain (e.g. query was just "The"), allow everything (trust Apple)
  if (tokens.length === 0) return true

  // 2. Build searchable text from item
  const searchText = [
    item.collectionName,
    item.trackName,
    item.artistName,
    // item.description, // Description might be too long/noisy, stick to high-value fields
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  // 3. At least ONE significant token must be present as a substring
  // This is a loose check to just filter out completely irrelevant "fallback" results
  return tokens.some((token) => searchText.includes(token))
}

/**
 * Extracts the podcast ID from an Apple Podcasts URL.
 * URL format example: https://podcasts.apple.com/us/podcast/the-daily/id1200361736
 */
function extractPodcastIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  const match = url.match(/\/id(\d+)/i)
  return match?.[1]
}

function getConfig() {
  const config = getAppConfig()
  const lookupEpisodesTtl = Number(config.CACHE_TTL_EPISODES_MS)
  const normalizedLookupEpisodesTtl =
    Number.isFinite(lookupEpisodesTtl) && lookupEpisodesTtl > 0
      ? Math.max(PODCAST_EPISODES_TTL_MS, lookupEpisodesTtl)
      : PODCAST_EPISODES_TTL_MS

  return {
    CACHE_MAX_ENTRIES: 50,
    STORAGE_MAX_ENTRIES: 60,
    CACHE_PROFILES: {
      searchPodcasts: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.searchPodcasts,
        namespace: EXPOSURE_API_PREFIX,
      },
      searchEpisodes: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.searchEpisodes,
        namespace: EXPOSURE_API_PREFIX,
      },
      lookupPodcast: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.lookupPodcast,
        namespace: EXPOSURE_API_PREFIX,
      },
      lookupPodcastEpisodes: {
        ttlMs: normalizedLookupEpisodesTtl,
        namespace: EXPOSURE_API_PREFIX,
      },
      lookupEpisode: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.lookupEpisode,
        namespace: EXPOSURE_API_PREFIX,
      },
      fetchTopPodcasts: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.fetchTopPodcasts,
        namespace: EXPOSURE_API_PREFIX,
      },
      fetchTopEpisodes: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.fetchTopEpisodes,
        namespace: EXPOSURE_API_PREFIX,
      },
      lookupPodcastsByIds: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.lookupPodcastsByIds,
        namespace: EXPOSURE_API_PREFIX,
      },
      fetchPodcastFeed: {
        ttlMs: DISCOVERY_CACHE_TTLS_MS.fetchPodcastFeed,
        namespace: FEED_CACHE_PREFIX,
      },
    } satisfies Record<string, CacheProfile>,
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

const memoryCache = new Map<string, CacheEntry<unknown>>()

function toStorageKey(namespace: CacheNamespace, key: string): string {
  return nsKey(namespace, key)
}

function getHardRetentionMs(ttlMs: number): number {
  return Math.max(ttlMs * 4, HARD_RETENTION_BASE_MS)
}

async function readEnvelope<T>(storageKey: string): Promise<CacheEnvelope<T> | null> {
  const entry = await DB.getRuntimeCacheEntry<T>(storageKey)
  if (!entry) return null
  if (typeof entry.at !== 'number') return null
  return {
    data: entry.data,
    at: entry.at,
    ttlMs: entry.ttlMs,
  }
}

async function readCache<T>(key: string, profile: CacheProfile): Promise<CacheReadResult<T>> {
  const now = Date.now()
  const storageKey = toStorageKey(profile.namespace, key)
  const memoryEntry = memoryCache.get(storageKey) as CacheEntry<T> | undefined

  if (memoryEntry) {
    const ageMs = now - memoryEntry.at
    return {
      status: ageMs <= memoryEntry.ttlMs ? 'fresh' : 'stale',
      data: memoryEntry.data,
      ageMs,
    }
  }

  const envelope = await readEnvelope<T>(storageKey)
  if (!envelope) {
    return { status: 'miss', ageMs: null }
  }
  const ttlMs = envelope.ttlMs ?? profile.ttlMs
  const ageMs = now - envelope.at
  memoryCache.set(storageKey, { data: envelope.data, at: envelope.at, ttlMs })
  return {
    status: ageMs <= ttlMs ? 'fresh' : 'stale',
    data: envelope.data,
    ageMs,
  }
}

function setMemoryCache<T>(storageKey: string, value: T, ttlMs: number): void {
  const { CACHE_MAX_ENTRIES } = getConfig()
  if (!memoryCache.has(storageKey) && memoryCache.size >= CACHE_MAX_ENTRIES) {
    let oldestKey: string | null = null
    let oldestAt = Number.POSITIVE_INFINITY
    for (const [candidateKey, entry] of memoryCache.entries()) {
      if (entry.at < oldestAt) {
        oldestAt = entry.at
        oldestKey = candidateKey
      }
    }
    if (oldestKey) memoryCache.delete(oldestKey)
  }
  memoryCache.set(storageKey, { data: value, at: Date.now(), ttlMs })
}

async function listDiscoveryStorageEntries(): Promise<CleanupCandidate[]> {
  const persistedEntries = await DB.getRuntimeCacheEntriesByNamespaces([
    EXPOSURE_API_PREFIX,
    FEED_CACHE_PREFIX,
  ])
  const entries: CleanupCandidate[] = []
  const now = Date.now()

  for (const entry of persistedEntries) {
    const ttlMs = entry.ttlMs ?? DEFAULT_TTL_MS
    const ageMs = now - entry.at
    // Treat impossible future timestamps as stale candidates.
    const normalizedAt = ageMs < 0 ? 0 : entry.at
    entries.push({
      storageKey: entry.key,
      at: normalizedAt,
      ttlMs,
    })
  }

  return entries
}

async function removeStorageEntries(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await DB.deleteRuntimeCacheEntries(keys)
  for (const key of keys) {
    memoryCache.delete(key)
  }
}

async function pruneStorageForCapacity(
  requiredSlots: number,
  mode: 'write' | 'maintenance' = 'write'
): Promise<boolean> {
  const { STORAGE_MAX_ENTRIES } = getConfig()
  const now = Date.now()
  const entries = await listDiscoveryStorageEntries()
  const evictable = entries
    .filter((entry) => now - entry.at > getHardRetentionMs(entry.ttlMs))
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at
      return a.storageKey.localeCompare(b.storageKey)
    })

  if (mode === 'maintenance' && evictable.length > 0) {
    await removeStorageEntries(evictable.map((entry) => entry.storageKey))
  }

  const currentSize = mode === 'maintenance' ? entries.length - evictable.length : entries.length
  const overflow = currentSize + requiredSlots - STORAGE_MAX_ENTRIES
  if (overflow <= 0) return true
  if (evictable.length < overflow) return false

  const keysToEvict = evictable.slice(0, overflow).map((entry) => entry.storageKey)
  await removeStorageEntries(keysToEvict)
  return true
}

async function ensureWritableSlot(requiredSlots: number): Promise<boolean> {
  if (requiredSlots <= 0) return true
  if (await pruneStorageForCapacity(requiredSlots, 'write')) return true
  // If no eligible entry exists under stale-safe rules, skip write.
  return false
}

async function runStorageMaintenance(): Promise<void> {
  await pruneStorageForCapacity(0, 'maintenance')
}

function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('quota')
}

async function persistCacheEnvelope<T>(
  storageKey: string,
  profile: CacheProfile,
  envelope: CacheEnvelope<T>
): Promise<boolean> {
  try {
    await DB.setRuntimeCacheEntry({
      key: storageKey,
      namespace: profile.namespace,
      data: envelope.data,
      at: envelope.at,
      ttlMs: envelope.ttlMs,
    })
    return true
  } catch (error) {
    if (import.meta.env.DEV) {
      log(
        isQuotaExceededError(error)
          ? '[discovery-cache] storage write skipped (quota exceeded)'
          : '[discovery-cache] storage write skipped (persist error)',
        {
          storageKey,
          error: error instanceof Error ? error.message : String(error),
        }
      )
    }
    return false
  }
}

function writeCache<T>(
  key: string,
  profile: CacheProfile,
  value: T,
  requestStartedAt: number
): Promise<WriteCacheResult> {
  return writeCacheInternal(key, profile, value, requestStartedAt)
}

async function writeCacheInternal<T>(
  key: string,
  profile: CacheProfile,
  value: T,
  requestStartedAt: number
): Promise<WriteCacheResult> {
  const storageKey = toStorageKey(profile.namespace, key)
  const current = memoryCache.get(storageKey)
  if (current && current.at > requestStartedAt) {
    return { applied: false, persisted: false, reason: 'skipped_newer_exists' }
  }
  const stored = await readEnvelope<T>(storageKey)
  if (stored && stored.at > requestStartedAt) {
    return { applied: false, persisted: false, reason: 'skipped_newer_exists' }
  }

  setMemoryCache(storageKey, value, profile.ttlMs)

  const existed = (await DB.getRuntimeCacheEntry(storageKey)) !== undefined
  if (!existed && !(await ensureWritableSlot(1))) {
    if (import.meta.env.DEV) {
      log('[discovery-cache] storage write skipped (protected fallback retention)', { storageKey })
    }
    return { applied: true, persisted: false, reason: 'skipped_capacity' }
  }
  const persisted = await persistCacheEnvelope(storageKey, profile, {
    data: value,
    at: Date.now(),
    ttlMs: profile.ttlMs,
  } satisfies CacheEnvelope<T>)
  if (!persisted) {
    return { applied: true, persisted: false, reason: 'skipped_quota' }
  }
  return { applied: true, persisted: true, reason: 'ok' }
}

interface FetchWithCacheOptions<T> {
  cacheKey: string
  profile: CacheProfile
  fetchNetwork: (signal?: AbortSignal) => Promise<T>
  signal?: AbortSignal
  debugLabel: string
  onBackgroundRefresh?: (data: T) => void
}

async function fetchWithSwr<T>({
  cacheKey,
  profile,
  fetchNetwork,
  signal,
  debugLabel,
  onBackgroundRefresh,
}: FetchWithCacheOptions<T>): Promise<T> {
  const cached = await readCache<T>(cacheKey, profile)
  if (cached.status === 'fresh') {
    return cached.data as T
  }

  if (cached.status === 'stale') {
    if (import.meta.env.DEV) {
      log('[discovery-cache] stale hit, revalidating in background', {
        key: cacheKey,
        label: debugLabel,
        ageMs: cached.ageMs,
      })
    }
    const revalidateStartedAt = Date.now()
    void fetchNetwork()
      .then(async (fresh) => {
        const result = await writeCache(cacheKey, profile, fresh, revalidateStartedAt)
        if (import.meta.env.DEV) {
          log('[discovery-cache] revalidate success', {
            key: cacheKey,
            label: debugLabel,
            ...result,
          })
        }
        if (result.applied) {
          onBackgroundRefresh?.(fresh)
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          log('[discovery-cache] revalidate failed; stale preserved', {
            key: cacheKey,
            label: debugLabel,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })
    return cached.data as T
  }

  const requestStartedAt = Date.now()
  const fresh = await fetchNetwork(signal)
  await writeCache(cacheKey, profile, fresh, requestStartedAt)
  return fresh
}

export async function runDiscoveryCacheMaintenance(): Promise<void> {
  await runStorageMaintenance()
}

export function clearDiscoveryMemoryCache(): void {
  memoryCache.clear()
}

export async function __resetDiscoveryCacheForTests(): Promise<void> {
  memoryCache.clear()
  await DB.clearRuntimeCacheByNamespaces([EXPOSURE_API_PREFIX, FEED_CACHE_PREFIX])
}

export async function __setDiscoveryCacheForTests<T>(
  key: string,
  profile: CacheProfile,
  data: T,
  at: number
): Promise<void> {
  const storageKey = toStorageKey(profile.namespace, key)
  await DB.setRuntimeCacheEntry({
    key: storageKey,
    namespace: profile.namespace,
    data,
    at,
    ttlMs: profile.ttlMs,
  })
}

export function __setDiscoveryMemoryCacheForTests<T>(
  key: string,
  profile: CacheProfile,
  data: T,
  at: number
): void {
  const storageKey = toStorageKey(profile.namespace, key)
  memoryCache.set(storageKey, { data, at, ttlMs: profile.ttlMs })
}

export async function __readDiscoveryCacheForTests<T>(
  key: string,
  profile: CacheProfile
): Promise<CacheReadResult<T>> {
  return readCache<T>(key, profile)
}

export async function __readDiscoveryPersistedCacheForTests<T>(
  key: string,
  profile: CacheProfile
): Promise<CacheEnvelope<T> | null> {
  const storageKey = toStorageKey(profile.namespace, key)
  return readEnvelope<T>(storageKey)
}

export async function __countDiscoveryPersistedCachesForTests(): Promise<number> {
  const entries = await DB.getRuntimeCacheEntriesByNamespaces([
    EXPOSURE_API_PREFIX,
    FEED_CACHE_PREFIX,
  ])
  return entries.length
}

type ParseResult<T> = { success: true; data: T } | { success: false; error: unknown }
type ParseableSchema<T> = { safeParse: (input: unknown) => ParseResult<T> }

function parseOrNull<T>(
  schema: ParseableSchema<T>,
  data: unknown,
  tag: string,
  rawItem?: unknown
): T | null {
  const result = schema.safeParse(data)
  if (!result.success) {
    logWarn(`[appleProvider] invalid ${tag}`, {
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
    logError('[parseRssXml] RSS parse failed:', errorMsg)
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

  const feedData = {
    title,
    description,
    artworkUrl: artworkUrl || undefined,
    episodes: initialEpisodes,
  }
  const feed = parseOrNull<ParsedFeed>(ParsedFeedSchema, feedData, 'feed schema')
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
    providerPodcastId: item.collectionId
      ? String(item.collectionId)
      : extractPodcastIdFromUrl(item.url),
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
    feedUrl: normalizeFeedUrlOrUndefined(item.feedUrl),
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
    feedUrl: normalizeFeedUrlOrUndefined(item.feedUrl),
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
    feedUrl: normalizeFeedUrlOrUndefined(item.feedUrl),
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
    providerEpisodeId: String(search.providerEpisodeId),
    collectionName: search.collectionName,
    artistName: search.artistName,
    feedUrl: normalizeFeedUrl(search.feedUrl ?? ''),
  }
  return parseOrNull(EpisodeSchema, data, 'mapped from provider search')
}

// ========== Apple Provider Implementation ==========

const appleProviderImplementation: DiscoveryProvider = {
  id: 'apple',

  searchPodcasts: async (query, country, limit, signal, options) => {
    const cleanQuery = query.toLowerCase().trim()
    if (!cleanQuery) return []

    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.searchPodcasts(country, cleanQuery, limit)
    const params = new URLSearchParams({
      term: cleanQuery,
      country,
      media: 'podcast',
      limit: String(limit),
    })
    const url = `${BASE_URLS.SEARCH}?${params}`

    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.searchPodcasts,
      signal,
      debugLabel: 'searchPodcasts',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
              signal: sharedSignal,
            })
            const rawResults = (data?.results || [])
              .map((item) => item as RawAppleItem)
              .filter((item) => isRelevant(item, cleanQuery))

            return rawResults
              .map((item) => mapSearchResult(item))
              .filter((r): r is Podcast => r !== null)
          }
        ),
    })
  },

  searchEpisodes: async (query, country, limit, signal, options) => {
    const cleanQuery = query.toLowerCase().trim()
    if (!cleanQuery) return []

    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.searchEpisodes(country, cleanQuery, limit)
    const params = new URLSearchParams({
      term: cleanQuery,
      country,
      media: 'podcast',
      entity: 'podcastEpisode',
      limit: String(limit),
    })
    const url = `${BASE_URLS.SEARCH}?${params}`

    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.searchEpisodes,
      signal,
      debugLabel: 'searchEpisodes',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
              signal: sharedSignal,
            })
            const rawResults = (data?.results || [])
              .map((item) => item as RawAppleItem)
              .filter((item) => isRelevant(item, cleanQuery))

            return rawResults
              .map((item) => mapSearchEpisodeResult(item))
              .filter((r): r is SearchEpisode => r !== null)
          }
        ),
    })
  },

  lookupPodcast: async (id, country, signal, options) => {
    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.lookupPodcast(country, id)
    const url = `${BASE_URLS.LOOKUP}?id=${id}&country=${country}&entity=podcast`
    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.lookupPodcast,
      signal,
      debugLabel: 'lookupPodcast',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
              signal: sharedSignal,
            })
            const result = (data?.results || [])
              .filter((r: unknown) => {
                const item = r as RawAppleItem
                return item.kind === 'podcast' || item.wrapperType === 'collection'
              })
              .map((item) => mapSearchResult(item as RawAppleItem))
              .filter((r): r is Podcast => r !== null)[0]
            return result ?? null
          }
        ),
    })
  },

  lookupPodcastEpisodes: async (id, country, limit, signal, options) => {
    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.lookupPodcastEpisodes(country, id, limit)
    const params = new URLSearchParams({
      id,
      country,
      entity: 'podcastEpisode',
      limit: String(limit),
    })
    const url = `${BASE_URLS.LOOKUP}?${params}`

    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.lookupPodcastEpisodes,
      signal,
      debugLabel: 'lookupPodcastEpisodes',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
              signal: sharedSignal,
            })
            const results = data?.results || []

            return (results as Array<Record<string, unknown>>)
              .filter((item) => item.wrapperType === 'podcastEpisode')
              .map((item) => {
                const searchEp = mapSearchEpisodeResult(item as RawAppleItem)
                return searchEp ? mapSearchToEpisode(searchEp) : null
              })
              .filter((e): e is Episode => e !== null)
          }
        ),
    })
  },

  fetchPodcastFeed: async (feedUrl, signal, options) => {
    const { CACHE_PROFILES } = getConfig()
    const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchPodcastFeed(normalizedFeedUrl)
    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.fetchPodcastFeed,
      signal,
      debugLabel: 'fetchPodcastFeed',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(normalizedFeedUrl),
          requestSignal,
          async (sharedSignal) => {
            const xmlText = await fetchTextWithFallback(normalizedFeedUrl || feedUrl, {
              signal: sharedSignal,
              forceProxy: true,
            })
            return parseRssXml(xmlText)
          }
        ),
    })
  },

  fetchTopPodcasts: async (country, limit, signal, options) => {
    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopPodcasts(country, limit)
    const url = `${BASE_URLS.RSS}/${country}/podcasts/top/${limit}/podcasts.json`
    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.fetchTopPodcasts,
      signal,
      debugLabel: 'fetchTopPodcasts',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ feed?: { results?: unknown[] } }>(url, {
              signal: sharedSignal,
            })
            const rawResults = (data?.feed?.results || []).map((item) =>
              mapRssResult(item as RawAppleItem)
            )
            return rawResults.filter((r): r is DiscoveryPodcast => r !== null)
          }
        ),
    })
  },

  fetchTopEpisodes: async (country, limit, signal, options) => {
    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.fetchTopEpisodes(country, limit)
    const url = `${BASE_URLS.RSS}/${country}/podcasts/top/${limit}/podcast-episodes.json`
    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.fetchTopEpisodes,
      signal,
      debugLabel: 'fetchTopEpisodes',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ feed?: { results?: unknown[] } }>(url, {
              signal: sharedSignal,
            })
            const rawResults = (data?.feed?.results || []).map((item) =>
              mapRssEpisodeResult(item as RawAppleItem)
            )
            return rawResults.filter((r): r is DiscoveryPodcast => r !== null)
          }
        ),
    })
  },

  fetchTopSubscriberPodcasts: async (_country, _limit, _signal) => {
    // Placeholder - Apple Provider expects Editor's Picks to be handled via lookupPodcastsByIds usually
    return []
  },

  lookupPodcastsByIds: async (ids: string[], country: string, signal?: AbortSignal, options?) => {
    if (ids.length === 0) return []

    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.lookupPodcastsByIds(country, ids)
    const url = `${BASE_URLS.LOOKUP}?id=${ids.join(',')}&country=${country}&entity=podcast`
    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.lookupPodcastsByIds,
      signal,
      debugLabel: 'lookupPodcastsByIds',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
              signal: sharedSignal,
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
            return rawResults.filter((r): r is DiscoveryPodcast => r !== null)
          }
        ),
    })
  },

  lookupEpisode: async (episodeId: string, country: string, signal?: AbortSignal, options?) => {
    const { BASE_URLS, CACHE_PROFILES } = getConfig()
    const cacheKey = DISCOVERY_CACHE_KEY_BUILDERS.lookupEpisode(country, episodeId)
    const params = new URLSearchParams({ id: episodeId, country, entity: 'podcastEpisode' })
    const url = `${BASE_URLS.LOOKUP}?${params}`

    return fetchWithSwr({
      cacheKey,
      profile: CACHE_PROFILES.lookupEpisode,
      signal,
      debugLabel: 'lookupEpisode',
      onBackgroundRefresh: options?.onBackgroundRefresh,
      fetchNetwork: (requestSignal) =>
        deduplicatedFetchWithCallerAbort(
          getRequestKey(url),
          requestSignal,
          async (sharedSignal) => {
            const data = await fetchJsonWithFallback<{ results?: unknown[] }>(url, {
              signal: sharedSignal,
            })
            const results = data?.results || []
            if (results.length === 0) return null

            const searchEp = mapSearchEpisodeResult(results[0] as RawAppleItem)
            if (!searchEp) return null

            return mapSearchToEpisode(searchEp)
          }
        ),
    })
  },
}
export const appleProvider = appleProviderImplementation
