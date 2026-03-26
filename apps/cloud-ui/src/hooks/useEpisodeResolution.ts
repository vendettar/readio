import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Episode, ParsedFeed, Podcast } from '@/lib/discovery'
import discovery from '@/lib/discovery'
import {
  buildPodcastFeedQueryKey,
  buildPodcastLookupQueryKey,
  buildPodcastProviderEpisodesQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from '@/lib/discovery/podcastQueryContract'
import { logError } from '@/lib/logger'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'
import { generateSlug, parseSlugWithId, toShortId8Token } from '@/lib/slugUtils'

interface UseEpisodeResolutionResult {
  podcast: Podcast | undefined | null
  episode: Episode | undefined
  isLoading: boolean
  podcastError: Error | null
  resolutionError: Error | null
}

function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Hook to resolve an episode and its podcast metadata from URL params.
 * Country authority in content routes is route-param only.
 */
export function resolveEpisodeByShortId(
  candidates: Episode[],
  shortId: string,
  titleSlug: string
): Episode | undefined {
  if (!shortId) return undefined

  const matches = candidates.filter((ep) => {
    const epIdToken = toShortId8Token(ep.id)
    const providerToken = ep.providerEpisodeId ? toShortId8Token(ep.providerEpisodeId) : ''
    return epIdToken === shortId || providerToken === shortId
  })

  if (matches.length === 0) return undefined
  if (matches.length === 1) return matches[0]

  const titleMatch = matches.find((ep) => generateSlug(ep.title) === titleSlug)
  if (titleMatch) return titleMatch

  return matches.sort((a, b) => {
    const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0
    const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0
    if (dateB !== dateA) return dateB - dateA
    return a.id.localeCompare(b.id)
  })[0]
}

export function useEpisodeResolution(
  podcastId: string,
  rawEpisodeId: string,
  routeCountry: string
): UseEpisodeResolutionResult {
  const queryClient = useQueryClient()
  const country = normalizeCountryParam(routeCountry)
  const normalizedPodcastId = podcastId.trim()
  const podcastQueryKey = buildPodcastLookupQueryKey(normalizedPodcastId, country)
  const providerEpisodesQueryKey = buildPodcastProviderEpisodesQueryKey(
    normalizedPodcastId,
    country
  )

  // 1. Fetch podcast metadata via Lookup API
  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery<Podcast | null>({
    queryKey: podcastQueryKey,
    queryFn: ({ signal }) =>
      discovery.getPodcast(normalizedPodcastId, country ?? '', signal, {
        onBackgroundRefresh: (fresh) => {
          queryClient.setQueryData(podcastQueryKey, fresh)
        },
      }),
    enabled: Boolean(country && normalizedPodcastId),
    staleTime: PODCAST_QUERY_CACHE_POLICY.lookup.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.lookup.gcTime,
  })

  // 2. Fetch episodes via RSS feed (only when we have feedUrl)
  const feedUrl = podcast?.feedUrl
  const feedQueryKey = buildPodcastFeedQueryKey(feedUrl)
  const {
    data: feed,
    isLoading: isLoadingFeed,
    error: feedError,
  } = useQuery({
    queryKey: feedQueryKey,
    queryFn: async ({ signal }): Promise<ParsedFeed> => {
      try {
        return await discovery.fetchPodcastFeed(feedUrl ?? '', signal, {
          onBackgroundRefresh: (fresh) => {
            queryClient.setQueryData(feedQueryKey, fresh)
          },
        })
      } catch (err) {
        if (isAbortError(err)) {
          throw err
        }
        if (import.meta.env.DEV) {
          logError('[useEpisodeResolution] feed_fetch_failed_fallback_provider', {
            reason: 'feed_fetch_failed_fallback_provider',
            podcastId: normalizedPodcastId,
            country,
            feedUrl,
            error: err,
          })
        }
        try {
          const providerEpisodes = await discovery.getPodcastEpisodes(
            normalizedPodcastId,
            country ?? '',
            300,
            signal
          )
          queryClient.setQueryData(providerEpisodesQueryKey, providerEpisodes)
          return {
            title: podcast?.collectionName || '',
            description: '',
            artworkUrl: podcast?.artworkUrl600 || podcast?.artworkUrl100,
            episodes: providerEpisodes,
          }
        } catch (providerErr) {
          if (isAbortError(providerErr)) {
            throw providerErr
          }
          if (import.meta.env.DEV) {
            logError('[useEpisodeResolution] feed_and_provider_failed', {
              reason: 'feed_and_provider_failed',
              podcastId: normalizedPodcastId,
              country,
              feedUrl,
              feedError: err,
              providerError: providerErr,
            })
          }
          throw providerErr
        }
      }
    },
    enabled: Boolean(feedUrl && country && normalizedPodcastId),
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  // 3. Parse slug param to extract shortId8 token
  const slugParsed = parseSlugWithId(rawEpisodeId)
  const shortId = slugParsed?.shortId ?? toShortId8Token(rawEpisodeId)
  const titleSlug = slugParsed?.titleSlug ?? ''

  let episode: Episode | undefined

  if (!episode) {
    episode = feed ? resolveEpisodeByShortId(feed.episodes, shortId, titleSlug) : undefined
  }

  const {
    data: providerEpisodes,
    isLoading: isLoadingProvider,
    error: providerEpisodesError,
  } = useQuery({
    queryKey: providerEpisodesQueryKey,
    queryFn: ({ signal }) =>
      discovery.getPodcastEpisodes(normalizedPodcastId, country ?? '', 300, signal, {
        onBackgroundRefresh: (fresh) => {
          queryClient.setQueryData(providerEpisodesQueryKey, fresh)
        },
      }),
    enabled: Boolean(country && normalizedPodcastId && feed && !episode),
    staleTime: PODCAST_QUERY_CACHE_POLICY.providerEpisodes.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.providerEpisodes.gcTime,
  })

  if (!episode && feed && providerEpisodes) {
    const providerMeta = resolveEpisodeByShortId(providerEpisodes, shortId, titleSlug)

    if (providerMeta) {
      episode = feed.episodes.find((ep) => {
        const titleMatch =
          providerMeta.title &&
          (ep.title || '').trim().toLowerCase() === (providerMeta.title || '').trim().toLowerCase()
        const urlMatch =
          providerMeta.audioUrl && ep.audioUrl.includes(providerMeta.audioUrl.split('?')[0])
        return titleMatch || urlMatch
      })

      if (!episode) {
        episode = providerMeta
      }
    }
  }

  const isLoading = !country || isLoadingPodcast || isLoadingFeed || (isLoadingProvider && !episode)
  const resolutionError =
    (podcastError as Error | null) ||
    (feedError as Error | null) ||
    (providerEpisodesError as Error | null) ||
    null

  return {
    podcast,
    episode,
    isLoading,
    podcastError: podcastError as Error | null,
    resolutionError,
  }
}
