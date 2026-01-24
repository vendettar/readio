import { useQuery } from '@tanstack/react-query'
import type { Episode, ParsedFeed, Podcast } from '@/lib/discovery'
import discovery from '@/lib/discovery'
import { logError } from '@/lib/logger'
import { getAppConfig } from '@/lib/runtimeConfig'
import { useExploreStore } from '@/store/exploreStore'

interface UseEpisodeResolutionResult {
  podcast: Podcast | undefined | null
  episode: Episode | undefined
  isLoading: boolean
  podcastError: Error | null
}

/**
 * Hook to resolve an episode and its podcast metadata from URL params.
 * Implements a multi-stage recovery strategy for inconsistent RSS/iTunes GUIDs.
 */
export function useEpisodeResolution(
  podcastId: string,
  rawEpisodeId: string
): UseEpisodeResolutionResult {
  const country = useExploreStore((s) => s.country) || getAppConfig().DEFAULT_COUNTRY

  // 1. Fetch podcast metadata via Lookup API
  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery<Podcast | null>({
    queryKey: ['podcast', 'lookup', podcastId, country],
    queryFn: () => discovery.getPodcast(podcastId, country),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // 2. Fetch episodes via RSS feed (only when we have feedUrl)
  const feedUrl = podcast?.feedUrl
  const { data: feed, isLoading: isLoadingFeed } = useQuery({
    queryKey: ['podcast', 'feed', feedUrl],
    queryFn: async (): Promise<ParsedFeed> => {
      try {
        return await discovery.fetchPodcastFeed(feedUrl ?? '')
      } catch (err) {
        logError('[useEpisodeResolution] RSS feed failed, returning basic info:', err)
        // Fallback: Use iTunes metadata if RSS fails
        return {
          title: podcast?.collectionName || '',
          description: '', // Keep empty or use podcast.artistName? standard Podcast type usually has artistName not description.
          artworkUrl: podcast?.artworkUrl600 || podcast?.artworkUrl100,
          episodes: [], // Episodes will be recovered from providerEpisodes query
        }
      }
    },
    enabled: !!feedUrl,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 6, // 6 hours
  })

  // 3. Decode and normalize episode ID
  let decodedEpisodeId = (rawEpisodeId || '').trim()
  try {
    decodedEpisodeId = decodeURIComponent(decodedEpisodeId)
  } catch {
    // Keep raw param if decoding fails.
  }

  // STEP 1: Direct ID Match (Fastest)
  let episode = feed?.episodes.find((ep) => ep.id === decodedEpisodeId)

  // STEP 2: Match Recovery Strategy (If direct GUID match fails)
  // Sometimes iTunes API GUID vs RSS GUID have subtle differences or iTunes GUID is missing
  const { data: providerEpisodes, isLoading: isLoadingProvider } = useQuery({
    queryKey: ['podcast', 'provider-episodes', podcastId, country],
    queryFn: () => discovery.getPodcastEpisodes(podcastId, country, 50),
    enabled: !!feed && !episode, // Only run if feed is loaded but episode not found
    staleTime: 1000 * 60 * 60,
  })

  if (!episode && feed && providerEpisodes) {
    // Recovery Strategy: Find in provider results using current ID or iTunes trackId
    const providerMeta = providerEpisodes.find(
      (ep) => ep.id === decodedEpisodeId || ep.providerEpisodeId === decodedEpisodeId
    )

    if (providerMeta) {
      // 1. Double-hop: Try to find in RSS feed using provider metadata (Title or URL match)
      episode = feed.episodes.find((ep) => {
        const titleMatch =
          providerMeta.title &&
          ep.title.trim().toLowerCase() === providerMeta.title.trim().toLowerCase()
        const urlMatch =
          providerMeta.audioUrl && ep.audioUrl.includes(providerMeta.audioUrl.split('?')[0])
        return titleMatch || urlMatch
      })

      // 2. Critical Fallback: Use provider metadata to create a "Virtual Episode"
      // This happens if the episode dropped off the RSS feed (very common for "This American Life")
      if (!episode) {
        episode = providerMeta
      }
    }
  }

  // Loading state: Include recovery phase to prevent "Flash of Empty State"
  const isLoading = isLoadingPodcast || isLoadingFeed || (isLoadingProvider && !episode)

  return {
    podcast,
    episode,
    isLoading,
    podcastError: podcastError as Error | null,
  }
}
