import { z } from 'zod'
import { FetchError, NetworkError } from '../fetchUtils'
import { normalizeFeedUrl } from './feedUrl'
import type { DiscoveryPodcast, Episode, Podcast, SearchEpisode } from './providers/types'
import type { ParsedFeed } from './schema'
import {
  DiscoveryPodcastSchema,
  EpisodeSchema,
  ParsedFeedSchema,
  PodcastSchema,
  SearchEpisodeSchema,
} from './schema'

const PodcastIndexFeedSummarySchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().url(),
  originalUrl: z.string().url().optional(),
  link: z.string().url().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  image: z.string().url().optional(),
  artwork: z.string().url().optional(),
  podcastItunesId: z.coerce.string().optional(),
  language: z.string().min(1).optional(),
  categories: z.record(z.string(), z.string()).optional(),
  podcastGuid: z.string().min(1),
  episodeCount: z.number().int().nonnegative().optional(),
})

export type PodcastIndexFeedSummary = z.infer<typeof PodcastIndexFeedSummarySchema>

function buildDiscoveryURL(pathname: string, search: URLSearchParams): string {
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

async function fetchDiscoveryJSON<T>(
  pathname: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  try {
    const response = await fetch(pathname, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal,
    })

    const text = await response.text()
    const parsed = text ? JSON.parse(text) : null

    if (!response.ok) {
      const message =
        parsed &&
        typeof parsed === 'object' &&
        'message' in parsed &&
        typeof parsed.message === 'string'
          ? parsed.message
          : `Cloud discovery request failed: ${response.status}`
      throw new FetchError(message, pathname, response.status, 'direct')
    }

    return parse(parsed)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new NetworkError(error.message)
    }
    throw error
  }
}

async function postDiscoveryJSON<T>(
  pathname: string,
  body: unknown,
  parse: (value: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  try {
    const response = await fetch(pathname, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })

    const text = await response.text()
    const parsed = text ? JSON.parse(text) : null

    if (!response.ok) {
      const message =
        parsed &&
        typeof parsed === 'object' &&
        'message' in parsed &&
        typeof parsed.message === 'string'
          ? parsed.message
          : `Cloud discovery request failed: ${response.status}`
      throw new FetchError(message, pathname, response.status, 'direct')
    }

    return parse(parsed)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new NetworkError(error.message)
    }
    throw error
  }
}

export function fetchTopPodcasts(
  country = 'us',
  limit = 30,
  signal?: AbortSignal
): Promise<DiscoveryPodcast[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/top-podcasts',
      new URLSearchParams({ country, limit: String(limit) })
    ),
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid top podcasts payload')
      }
      return value.map((item) => DiscoveryPodcastSchema.parse(item))
    },
    signal
  )
}

export function searchPodcasts(
  term: string,
  country = 'us',
  limit = 20,
  signal?: AbortSignal
): Promise<Podcast[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/search/podcasts',
      new URLSearchParams({ term: term.toLowerCase().trim(), country, limit: String(limit) })
    ),
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid podcast search payload')
      }
      return value.map((item) => PodcastSchema.parse(item))
    },
    signal
  )
}

export function searchEpisodes(
  term: string,
  country = 'us',
  limit = 50,
  signal?: AbortSignal
): Promise<SearchEpisode[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/search/episodes',
      new URLSearchParams({ term: term.toLowerCase().trim(), country, limit: String(limit) })
    ),
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid episode search payload')
      }
      return value.map((item) => SearchEpisodeSchema.parse(item))
    },
    signal
  )
}

export function fetchTopEpisodes(
  country = 'us',
  limit = 30,
  signal?: AbortSignal
): Promise<DiscoveryPodcast[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/top-episodes',
      new URLSearchParams({ country, limit: String(limit) })
    ),
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid top episodes payload')
      }
      return value.map((item) => DiscoveryPodcastSchema.parse(item))
    },
    signal
  )
}

export function getPodcastIndexPodcastByItunesId(
  podcastItunesId: string,
  signal?: AbortSignal
): Promise<Podcast | null> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/podcast-index/podcast-byitunesid',
      new URLSearchParams({ podcastItunesId })
    ),
    (value) => (value === null ? null : PodcastSchema.parse(value)),
    signal
  )
}

export function getPodcastIndexPodcastsBatchByGuid(
  guids: string[],
  signal?: AbortSignal
): Promise<PodcastIndexFeedSummary[]> {
  if (guids.length === 0) return Promise.resolve([])

  return postDiscoveryJSON(
    '/api/v1/discovery/podcast-index/podcasts-batch-byguid',
    guids,
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid podcast index guid batch payload')
      }
      return value.map((item) => PodcastIndexFeedSummarySchema.parse(item))
    },
    signal
  )
}

export function getPodcastIndexEpisodes(
  podcastItunesId: string,
  limit = 300,
  signal?: AbortSignal
): Promise<Episode[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  params.set('podcastItunesId', podcastItunesId)

  return fetchDiscoveryJSON(
    buildDiscoveryURL('/api/v1/discovery/podcast-index/episodes', params),
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid podcast index episodes payload')
      }
      return value.map((item) => EpisodeSchema.parse(item))
    },
    signal
  )
}

export function getPodcastIndexEpisodeByGuid(
  episodeGuid: string,
  podcastItunesId: string,
  signal?: AbortSignal
): Promise<Episode | null> {
  const params = new URLSearchParams({ guid: episodeGuid })
  params.set('podcastItunesId', podcastItunesId)

  return fetchDiscoveryJSON(
    buildDiscoveryURL('/api/v1/discovery/podcast-index/episodes', params),
    (value) => (value === null ? null : EpisodeSchema.parse(value)),
    signal
  )
}

export function fetchPodcastFeed(feedUrl: string, signal?: AbortSignal): Promise<ParsedFeed> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/feed',
      new URLSearchParams({ url: normalizeFeedUrl(feedUrl) })
    ),
    (value) => ParsedFeedSchema.parse(value),
    signal
  )
}
