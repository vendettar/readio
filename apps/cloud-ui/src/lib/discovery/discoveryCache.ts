import { DB } from '../dexieDb'

// ========== Constants & Config ==========

export const EXPOSURE_API_PREFIX = 'readioDiscoveryV1'
export const FEED_CACHE_PREFIX = 'feed'

export const DISCOVERY_CACHE_TTLS_MS = {
  fetchTopPodcasts: 24 * 60 * 60 * 1000,
  fetchTopEpisodes: 24 * 60 * 60 * 1000,
  fetchPodcastFeed: 24 * 60 * 60 * 1000,
} as const

export const DISCOVERY_CACHE_KEY_BUILDERS = {
  fetchTopPodcasts: (country: string, limit: number) => `top:${country}:${limit}`,
  fetchTopEpisodes: (country: string, limit: number) => `topEpisodes:${country}:${limit}`,
  fetchPodcastFeed: (feedUrl: string) => feedUrl,
} as const

// ========== Shared Cache Logic ==========

const memoryCache = new Map<string, unknown>()

export async function runDiscoveryCacheMaintenance(): Promise<void> {
  // Legacy cleanup for namespaces no longer actively written to by the cloud discovery stack
  await DB.clearRuntimeCacheByNamespaces([EXPOSURE_API_PREFIX, FEED_CACHE_PREFIX])
}

export function clearDiscoveryMemoryCache(): void {
  memoryCache.clear()
}

// ========== Test Helpers ==========

export async function __resetDiscoveryCacheForTests(): Promise<void> {
  memoryCache.clear()
  await DB.clearRuntimeCacheByNamespaces([EXPOSURE_API_PREFIX, FEED_CACHE_PREFIX])
}
