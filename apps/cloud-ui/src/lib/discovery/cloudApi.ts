import { z } from 'zod'

import { FetchError, NetworkError } from '../fetchUtils'
import type {
  EditorPickPodcast,
  Podcast,
  PodcastEpisodes,
  SearchEpisode,
  SearchPodcast,
  TopEpisode,
  TopPodcast,
} from './schema'
import {
  EditorPickPodcastSchema,
  PIPodcastSchema,
  PodcastEpisodesSchema,
  SearchEpisodeSchema,
  SearchPodcastSchema,
  TopEpisodeSchema,
  TopPodcastSchema,
} from './schema'

export class DiscoveryParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'DiscoveryParseError'
  }
}

export class DiscoveryInvalidPayloadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'DiscoveryInvalidPayloadError'
  }
}

export function shouldRetryDiscoveryRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false

  if (
    error instanceof NetworkError ||
    error instanceof DiscoveryParseError ||
    error instanceof DiscoveryInvalidPayloadError
  ) {
    return false
  }

  if (error instanceof FetchError) {
    return (error.status ?? 0) >= 500
  }

  return false
}

const DiscoveryErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  request_id: z.string(),
})

const DISCOVERY_ROUTE = {
  topPodcasts: '/api/v1/discovery/top-podcasts',
  searchPodcasts: '/api/v1/discovery/search/podcasts',
  searchEpisodes: '/api/v1/discovery/search/episodes',
  topEpisodes: '/api/v1/discovery/top-episodes',
  podcasts: '/api/v1/discovery/podcasts',
  podcastsBatch: '/api/v1/discovery/podcasts/batch',
  podcastEpisodes: (podcastItunesId: string) =>
    `/api/v1/discovery/podcasts/${encodeURIComponent(podcastItunesId)}/episodes`,
} as const

function buildDiscoveryURL(pathname: string, search: URLSearchParams): string {
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

function parseDiscoveryJSON(method: 'GET' | 'POST', pathname: string, text: string): unknown {
  try {
    return text ? JSON.parse(text) : null
  } catch (error) {
    throw new DiscoveryParseError(`${method} ${pathname}: invalid JSON response`, error)
  }
}

function validateDiscoveryPayload<T>(
  method: 'GET' | 'POST',
  pathname: string,
  value: unknown,
  parse: (value: unknown) => T
): T {
  try {
    return parse(value)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DiscoveryInvalidPayloadError(
        `${method} ${pathname}: discovery payload validation failed`,
        error
      )
    }
    if (error instanceof DiscoveryParseError || error instanceof DiscoveryInvalidPayloadError) {
      throw error
    }
    if (error instanceof Error) {
      throw new DiscoveryInvalidPayloadError(`${method} ${pathname}: ${error.message}`, error)
    }
    throw error
  }
}

async function executeDiscoveryRequest<T>(
  method: 'GET' | 'POST',
  pathname: string,
  body: unknown,
  parse: (value: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  const fetchOptions: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    signal,
  }

  if (method === 'POST' && body) {
    fetchOptions.body = JSON.stringify(body)
  }

  try {
    const response = await fetch(pathname, fetchOptions)
    const text = await response.text()
    const value = parseDiscoveryJSON(method, pathname, text)

    if (!response.ok) {
      const errorPayload = DiscoveryErrorSchema.safeParse(value)
      if (errorPayload.success) {
        throw new FetchError(errorPayload.data.message, pathname, response.status, 'direct', {
          code: errorPayload.data.code,
          requestId: errorPayload.data.request_id,
        })
      }

      throw new FetchError(
        `Cloud discovery request failed: ${response.status}`,
        pathname,
        response.status,
        'direct'
      )
    }

    return validateDiscoveryPayload(method, pathname, value, parse)
  } catch (error) {
    if (error instanceof TypeError) {
      throw new NetworkError(error.message)
    }
    throw error
  }
}

async function fetchDiscoveryJSON<T>(
  pathname: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  return executeDiscoveryRequest('GET', pathname, null, parse, signal)
}

async function postDiscoveryJSON<T>(
  pathname: string,
  body: unknown,
  parse: (value: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  return executeDiscoveryRequest('POST', pathname, body, parse, signal)
}

export function fetchTopPodcasts(country = 'us', signal?: AbortSignal): Promise<TopPodcast[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(DISCOVERY_ROUTE.topPodcasts, new URLSearchParams({ country })),
    (value) => z.array(TopPodcastSchema).parse(value),
    signal
  )
}

export function searchPodcasts(
  term: string,
  country = 'us',
  signal?: AbortSignal
): Promise<SearchPodcast[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      DISCOVERY_ROUTE.searchPodcasts,
      new URLSearchParams({ term: term.toLowerCase().trim(), country })
    ),
    (value) => z.array(SearchPodcastSchema).parse(value),
    signal
  )
}

export function searchEpisodes(
  term: string,
  country = 'us',
  signal?: AbortSignal
): Promise<SearchEpisode[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      DISCOVERY_ROUTE.searchEpisodes,
      new URLSearchParams({ term: term.toLowerCase().trim(), country })
    ),
    (value) => z.array(SearchEpisodeSchema).parse(value),
    signal
  )
}

export function fetchTopEpisodes(country = 'us', signal?: AbortSignal): Promise<TopEpisode[]> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(DISCOVERY_ROUTE.topEpisodes, new URLSearchParams({ country })),
    (value) => z.array(TopEpisodeSchema).parse(value),
    signal
  )
}

export function getPodcastIndexPodcastByItunesId(
  podcastItunesId: string,
  signal?: AbortSignal
): Promise<Podcast | null> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(
      `${DISCOVERY_ROUTE.podcasts}/${encodeURIComponent(podcastItunesId)}`,
      new URLSearchParams()
    ),
    (value) => (value === null ? null : PIPodcastSchema.parse(value)),
    signal
  )
}

export function getPodcastIndexPodcastsBatchByGuid(
  guids: string[],
  signal?: AbortSignal
): Promise<EditorPickPodcast[]> {
  if (guids.length === 0) return Promise.resolve([])

  return postDiscoveryJSON(
    DISCOVERY_ROUTE.podcastsBatch,
    guids,
    (value) => z.array(EditorPickPodcastSchema).parse(value),
    signal
  )
}

export function fetchPodcastEpisodes(
  podcastItunesId: string,
  signal?: AbortSignal
): Promise<PodcastEpisodes> {
  return fetchDiscoveryJSON(
    buildDiscoveryURL(DISCOVERY_ROUTE.podcastEpisodes(podcastItunesId), new URLSearchParams()),
    (value) => PodcastEpisodesSchema.parse(value),
    signal
  )
}
