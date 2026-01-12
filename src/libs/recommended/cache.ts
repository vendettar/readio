import { getAppConfig } from '../runtimeConfig'
import { getJson, getJsonWithTtl, nsKey, setJsonWithTtl } from '../storage'
import type { CacheResult, CacheStatus, RecommendedGroup, RecommendedPodcast } from './types'

const RECOMMENDED_CACHE_PREFIX = 'readioExploreRecommendedV2'
const CHART_CACHE_PREFIX = 'readioDiscoveryTopPodcastsV1'
const LOOKUP_CACHE_PREFIX = 'readioDiscoveryTopLookupV1'
const FEED_FETCHABILITY_PREFIX = 'readioExploreFeedFetchabilityV1'

export const FEED_FETCHABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000

function getConstants() {
  const config = getAppConfig()
  return {
    RECOMMENDED_TTL_MS: config.RECOMMENDED_TTL_MS,
    RECOMMENDED_PURGE_MS: config.RECOMMENDED_TTL_MS * 3,
    CHART_CACHE_TTL_MS: config.RECOMMENDED_TTL_MS,
    CHART_CACHE_PURGE_MS: config.RECOMMENDED_TTL_MS * 3,
  }
}

interface StoredWithTimestamp<T> {
  data: T
  at: number
}

// ============ Chart Cache ============

export function getChartCacheKey(country: string): string {
  return nsKey(CHART_CACHE_PREFIX, country.toLowerCase())
}

export function readChartCacheWithStatus(
  country: string
): { ids: string[]; at: number; status: CacheStatus } | null {
  const key = getChartCacheKey(country)
  // We use a custom TTL check here because we need 'stale' vs 'expired' distinction
  // getJsonWithTtl returns null if expired, but we might want stale data
  // However, to standardize, we'll use getJsonWithTtl for the hard expiry (which is infinity in the old code? No, simple TTL)
  // Actually, the old code logic:
  // age <= TTL -> fresh
  // age <= PURGE -> stale
  // age > PURGE -> expired

  // getJsonWithTtl(key, ttl) returns value if age <= ttl, else null.
  // To support "stale", we can use getJsonWithTtl with the PURGE time, then check age manually.

  const result = getJson<StoredWithTimestamp<{ ids: string[] }>>(key)
  if (!result) return null

  const { data, at } = result
  if (!data || !Array.isArray(data.ids)) return null

  const age = Date.now() - at
  const { CHART_CACHE_TTL_MS } = getConstants()
  const status: CacheStatus = age <= CHART_CACHE_TTL_MS ? 'fresh' : 'stale' // helper already filtered out expired

  return { ids: data.ids, at, status }
}

export function writeChartCache(country: string, ids: string[]): void {
  const key = getChartCacheKey(country)
  setJsonWithTtl(key, { ids })
}

// ============ Lookup Cache ============

export function getLookupCacheKey(country: string): string {
  return nsKey(LOOKUP_CACHE_PREFIX, country.toLowerCase())
}

export function readLookupCache(country: string): Record<string, RecommendedPodcast> | null {
  const key = getLookupCacheKey(country)
  const { CHART_CACHE_TTL_MS } = getConstants()
  const result = getJsonWithTtl<{ entries: Record<string, RecommendedPodcast> }>(
    key,
    CHART_CACHE_TTL_MS
  )
  if (!result) return null
  return result.entries
}

export function writeLookupCache(
  country: string,
  entries: Record<string, RecommendedPodcast>
): void {
  const key = getLookupCacheKey(country)
  setJsonWithTtl(key, { entries })
}

// ============ Recommended Groups Cache ============

export function getRecommendedCacheKey(country: string, lang: string): string {
  return nsKey(RECOMMENDED_CACHE_PREFIX, `${country.toLowerCase()}:${lang.toLowerCase()}`)
}

export function readRecommendedCacheWithStatus(
  country: string,
  lang: string
): CacheResult<RecommendedGroup[]> {
  const key = getRecommendedCacheKey(country, lang)
  // Similar stale/fresh logic
  const result = getJson<StoredWithTimestamp<{ groups: RecommendedGroup[] }>>(key)

  if (!result) return { data: null, status: 'expired', age: Infinity }

  const { data, at } = result
  if (!data.groups || !Array.isArray(data.groups)) {
    return { data: null, status: 'expired', age: Infinity }
  }

  const age = Date.now() - at
  const { RECOMMENDED_TTL_MS } = getConstants()
  const status: CacheStatus = age <= RECOMMENDED_TTL_MS ? 'fresh' : 'stale'

  return { data: data.groups, status, age }
}

export function writeRecommendedCache(
  country: string,
  lang: string,
  groups: RecommendedGroup[]
): void {
  const key = getRecommendedCacheKey(country, lang)
  setJsonWithTtl(key, { groups })
}

// ============ Feed Fetchability Cache ============

export function getFetchabilityCacheKey(country: string): string {
  return nsKey(FEED_FETCHABILITY_PREFIX, country.toLowerCase())
}

export function readFetchabilityCache(
  country: string
): Record<string, { ok: boolean; at: number }> {
  // This cache is a single object mapping URL -> status
  // The previous implementation stored it as a big map.
  // We can keep it simple.
  const key = getFetchabilityCacheKey(country)

  // We don't really use TTL on the whole object, but on individual entries.
  // So we just load the object.
  // However, to keep it clean, maybe we treat the file as persistent.
  // Let's use getJsonWithTtl with a very long TTL for the container, or just getJson?
  // The old code checked individual entries.

  // We will use getJsonWithTtl with a huge TTL just to get the `at` wrapping (standardization),
  // or better, just getJson since we manage internal expirations.
  // BUT setJsonWithTtl is standard. Let's use setJsonWithTtl with a year TTL for the container
  // (though effectively we don't expire the container, we expire entries).
  // Actually, `getJsonWithTtl` helps us get the `at` timestamp.

  // Wait, the entries themselves have an `at` property.
  // Let's us `getJson` for the map as a whole.
  // But `setJsonWithTtl` wraps with `data` and `at`. If we use `getJson`, we see that structure.

  // Simplest: Use getJsonWithTtl(key, Infinity).

  // Use getJson to access raw data structure
  const result = getJson<StoredWithTimestamp<Record<string, { ok: boolean; at: number }>>>(key)
  if (!result || !result.data) return {}

  const cache = result.data
  const now = Date.now()
  const cleanResult: Record<string, { ok: boolean; at: number }> = {}

  Object.entries(cache).forEach(([url, entry]) => {
    const item = entry as { ok: boolean; at: number }
    if (
      item &&
      typeof item === 'object' &&
      typeof item.ok === 'boolean' &&
      typeof item.at === 'number'
    ) {
      if (now - item.at < FEED_FETCHABILITY_TTL_MS) {
        cleanResult[url] = item
      }
    }
  })

  return cleanResult
}

export function writeFetchabilityCache(
  country: string,
  cache: Record<string, { ok: boolean; at: number }>
): void {
  const key = getFetchabilityCacheKey(country)
  setJsonWithTtl(key, cache)
}
