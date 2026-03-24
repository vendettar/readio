import { DB } from '../dexieDb'
import { warn } from '../logger'
import { getAppConfig } from '../runtimeConfig'
import { nsKey } from '../storage'
import type { CacheResult, CacheStatus, RecommendedGroup, RecommendedPodcast } from './types'

const RECOMMENDED_CACHE_PREFIX = 'readioExploreRecommendedV2'
const CHART_CACHE_PREFIX = 'readioDiscoveryTopPodcastsV1'
const LOOKUP_CACHE_PREFIX = 'readioDiscoveryTopLookupV1'
const FEED_FETCHABILITY_PREFIX = 'readioExploreFeedFetchabilityV1'

const RUNTIME_CACHE_NAMESPACES = {
  recommended: RECOMMENDED_CACHE_PREFIX,
  chart: CHART_CACHE_PREFIX,
  lookup: LOOKUP_CACHE_PREFIX,
  feedFetchability: FEED_FETCHABILITY_PREFIX,
} as const

export const FEED_FETCHABILITY_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface RuntimeEnvelope<T> {
  data: T
  at: number
  ttlMs?: number
}

const memoryCache = new Map<string, RuntimeEnvelope<unknown>>()

function getConstants() {
  const config = getAppConfig()
  return {
    RECOMMENDED_TTL_MS: config.RECOMMENDED_TTL_MS,
    RECOMMENDED_PURGE_MS: config.RECOMMENDED_TTL_MS * 3,
    CHART_CACHE_TTL_MS: config.RECOMMENDED_TTL_MS,
    CHART_CACHE_PURGE_MS: config.RECOMMENDED_TTL_MS * 3,
  }
}

async function readRuntimeCache<T>(key: string): Promise<RuntimeEnvelope<T> | null> {
  const inMemory = memoryCache.get(key) as RuntimeEnvelope<T> | undefined
  if (inMemory) return inMemory

  const persisted = await DB.getRuntimeCacheEntry<T>(key)
  if (!persisted) return null

  const envelope: RuntimeEnvelope<T> = {
    data: persisted.data,
    at: persisted.at,
    ttlMs: persisted.ttlMs,
  }
  memoryCache.set(key, envelope)
  return envelope
}

async function writeRuntimeCache<T>(
  namespace: string,
  key: string,
  data: T,
  ttlMs?: number
): Promise<void> {
  const envelope: RuntimeEnvelope<T> = { data, at: Date.now(), ttlMs }
  memoryCache.set(key, envelope)

  try {
    await DB.setRuntimeCacheEntry({
      key,
      namespace,
      data,
      at: envelope.at,
      ttlMs,
    })
  } catch (error) {
    warn('[recommended-cache] persist failed', {
      key,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// ============ Chart Cache ============

export function getChartCacheKey(country: string): string {
  return nsKey(CHART_CACHE_PREFIX, country.toLowerCase())
}

export async function readChartCacheWithStatus(
  country: string
): Promise<{ ids: string[]; at: number; status: CacheStatus } | null> {
  const key = getChartCacheKey(country)
  const result = await readRuntimeCache<{ ids: string[] }>(key)
  if (!result || !result.data || !Array.isArray(result.data.ids)) return null

  const age = Date.now() - result.at
  const { CHART_CACHE_TTL_MS } = getConstants()
  const status: CacheStatus = age <= CHART_CACHE_TTL_MS ? 'fresh' : 'stale'

  return { ids: result.data.ids, at: result.at, status }
}

export async function writeChartCache(country: string, ids: string[]): Promise<void> {
  const key = getChartCacheKey(country)
  await writeRuntimeCache(RUNTIME_CACHE_NAMESPACES.chart, key, { ids })
}

// ============ Lookup Cache ============

export function getLookupCacheKey(country: string): string {
  return nsKey(LOOKUP_CACHE_PREFIX, country.toLowerCase())
}

export async function readLookupCache(
  country: string
): Promise<Record<string, RecommendedPodcast> | null> {
  const key = getLookupCacheKey(country)
  const result = await readRuntimeCache<{ entries: Record<string, RecommendedPodcast> }>(key)
  if (!result || !result.data || typeof result.data.entries !== 'object') return null

  const { CHART_CACHE_TTL_MS } = getConstants()
  if (Date.now() - result.at > CHART_CACHE_TTL_MS) return null

  return result.data.entries
}

export async function writeLookupCache(
  country: string,
  entries: Record<string, RecommendedPodcast>
): Promise<void> {
  const key = getLookupCacheKey(country)
  await writeRuntimeCache(RUNTIME_CACHE_NAMESPACES.lookup, key, { entries })
}

// ============ Recommended Groups Cache ============

export function getRecommendedCacheKey(country: string, lang: string): string {
  return nsKey(RECOMMENDED_CACHE_PREFIX, `${country.toLowerCase()}:${lang.toLowerCase()}`)
}

export async function readRecommendedCacheWithStatus(
  country: string,
  lang: string
): Promise<CacheResult<RecommendedGroup[]>> {
  const key = getRecommendedCacheKey(country, lang)
  const result = await readRuntimeCache<{ groups: RecommendedGroup[] }>(key)

  if (!result) return { data: null, status: 'expired', age: Infinity }
  if (!result.data.groups || !Array.isArray(result.data.groups)) {
    return { data: null, status: 'expired', age: Infinity }
  }

  const age = Date.now() - result.at
  const { RECOMMENDED_TTL_MS } = getConstants()
  const status: CacheStatus = age <= RECOMMENDED_TTL_MS ? 'fresh' : 'stale'

  return { data: result.data.groups, status, age }
}

export async function writeRecommendedCache(
  country: string,
  lang: string,
  groups: RecommendedGroup[]
): Promise<void> {
  const key = getRecommendedCacheKey(country, lang)
  await writeRuntimeCache(RUNTIME_CACHE_NAMESPACES.recommended, key, { groups })
}

// ============ Feed Fetchability Cache ============

export function getFetchabilityCacheKey(country: string): string {
  return nsKey(FEED_FETCHABILITY_PREFIX, country.toLowerCase())
}

export async function readFetchabilityCache(
  country: string
): Promise<Record<string, { ok: boolean; at: number }>> {
  const key = getFetchabilityCacheKey(country)
  const result = await readRuntimeCache<Record<string, { ok: boolean; at: number }>>(key)
  if (!result || !result.data) return {}

  const now = Date.now()
  const cleanResult: Record<string, { ok: boolean; at: number }> = {}

  Object.entries(result.data).forEach(([url, entry]) => {
    const item = entry as { ok: boolean; at: number }
    if (
      item &&
      typeof item === 'object' &&
      typeof item.ok === 'boolean' &&
      typeof item.at === 'number' &&
      now - item.at < FEED_FETCHABILITY_TTL_MS
    ) {
      cleanResult[url] = item
    }
  })

  if (Object.keys(cleanResult).length !== Object.keys(result.data).length) {
    await writeFetchabilityCache(country, cleanResult)
  }

  return cleanResult
}

export async function writeFetchabilityCache(
  country: string,
  cache: Record<string, { ok: boolean; at: number }>
): Promise<void> {
  const key = getFetchabilityCacheKey(country)
  await writeRuntimeCache(RUNTIME_CACHE_NAMESPACES.feedFetchability, key, cache)
}

export function clearRecommendedMemoryCache(): void {
  memoryCache.clear()
}
