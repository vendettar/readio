import type { ParsedFeed } from '@readio/core'
import {
  DiscoveryPodcastSchema,
  EpisodeSchema,
  ParsedFeedSchema,
  PodcastSchema,
  SearchEpisodeSchema,
} from '@readio/core'
import { FetchError, NetworkError } from '../fetchUtils'
import { normalizeFeedUrl } from './feedUrl'
import type { DiscoveryPodcast, Episode, Podcast, SearchEpisode } from './providers/types'

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

export function getPodcast(
  id: string,
  country = 'us',
  signal?: AbortSignal
): Promise<Podcast | null> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL('/api/v1/discovery/lookup/podcast', new URLSearchParams({ id, country })),
    (value) => (value === null ? null : PodcastSchema.parse(value)),
    signal
  )
}

export function getPodcastEpisodes(
  id: string,
  country = 'us',
  limit = 50,
  signal?: AbortSignal
): Promise<Episode[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/lookup/podcast-episodes',
      new URLSearchParams({ id, country, limit: String(limit) })
    ),
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid podcast episodes payload')
      }
      return value.map((item) => EpisodeSchema.parse(item))
    },
    signal
  )
}

export function lookupPodcastsByIds(
  ids: string[],
  country = 'us',
  signal?: AbortSignal
): Promise<DiscoveryPodcast[]> {
  if (ids.length === 0) return Promise.resolve([])

  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      '/api/v1/discovery/lookup/podcasts',
      new URLSearchParams({ ids: ids.join(','), country })
    ),
    (value) => {
      if (!Array.isArray(value)) {
        throw new Error('Invalid lookup podcasts payload')
      }
      return value.map((item) => DiscoveryPodcastSchema.parse(item))
    },
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
