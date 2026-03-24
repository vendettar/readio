import { fetchTextWithFallback } from '../fetchUtils'
import { warn } from '../logger'
import { deduplicatedFetch, getRequestKey } from '../requestManager'
import { readFetchabilityCache, writeFetchabilityCache } from './cache'
import type { RecommendedPodcast } from './types'

export function matchesGenreTokens(genreNames: string[], term: string): boolean {
  if (!term) return true
  const tokens = term.toLowerCase().split(/\s+/).filter(Boolean)
  const genres = genreNames.map((g) => g.toLowerCase()).join(' ')
  return tokens.some((token) => genres.includes(token))
}

export async function getFeedFetchabilityStatus(
  country: string,
  feedUrl: string
): Promise<boolean | null> {
  const cache = await readFetchabilityCache(country)
  const entry = cache[feedUrl.toLowerCase()]
  if (!entry) return null
  return entry.ok
}

export async function setFeedFetchabilityStatus(
  country: string,
  feedUrl: string,
  ok: boolean
): Promise<void> {
  const cache = await readFetchabilityCache(country)
  cache[feedUrl.toLowerCase()] = { ok, at: Date.now() }
  await writeFetchabilityCache(country, cache)
}

export async function validateFeedFetchable(
  country: string,
  feedUrl: string,
  signal?: AbortSignal
): Promise<boolean> {
  const cached = await getFeedFetchabilityStatus(country, feedUrl)
  if (cached !== null) return cached

  const requestKey = getRequestKey(feedUrl)

  try {
    return await deduplicatedFetch<boolean>(requestKey, async (fetchSignal) => {
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      fetchSignal.addEventListener('abort', abort, { once: true })

      try {
        await fetchTextWithFallback(feedUrl, { signal: controller.signal, timeoutMs: 5000 })
        await setFeedFetchabilityStatus(country, feedUrl, true)
        return true
      } catch {
        await setFeedFetchabilityStatus(country, feedUrl, false)
        return false
      } finally {
        signal?.removeEventListener('abort', abort)
        fetchSignal.removeEventListener('abort', abort)
      }
    })
  } catch (err) {
    warn(`[Recommended] Feed validation failed: ${feedUrl}`, { country, error: err })
    return false
  }
}

export async function pickCorsAllowedRecommended(
  country: string,
  items: RecommendedPodcast[],
  options: { signal?: AbortSignal; desired?: number; seenFeeds?: Set<string> } = {}
): Promise<RecommendedPodcast[]> {
  const { signal, desired = 3, seenFeeds = new Set() } = options
  const picked: RecommendedPodcast[] = []
  const unknown: RecommendedPodcast[] = []

  for (const item of items) {
    if (picked.length >= desired) break
    const feedKey = item.feedUrl.toLowerCase()
    if (seenFeeds.has(feedKey)) continue

    const status = await getFeedFetchabilityStatus(country, item.feedUrl)
    if (status === true) {
      picked.push(item)
      seenFeeds.add(feedKey)
    } else if (status === null) {
      unknown.push(item)
    }
  }

  if (picked.length >= desired) return picked.slice(0, desired)

  for (const item of unknown) {
    if (signal?.aborted) break
    if (picked.length >= desired) break
    const ok = await validateFeedFetchable(country, item.feedUrl, signal)
    if (ok) {
      picked.push(item)
      seenFeeds.add(item.feedUrl.toLowerCase())
    }
  }
  return picked.slice(0, desired)
}
