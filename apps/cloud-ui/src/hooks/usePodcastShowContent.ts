import { useQueryClient } from '@tanstack/react-query'
import type { EditorPickPodcast, Episode, Podcast } from '@/lib/discovery'
import {
  getCachedEditorPickByItunesID,
  getCanonicalEditorPickPodcastID,
  getEditorPickRouteState,
  mapEditorPickToPodcast,
} from '@/lib/discovery/editorPicks'
import { getDiscoveryArtworkUrl } from '@/lib/imageUtils'
import { buildPodcastEpisodesRoute, normalizeCountryParam } from '@/lib/routes/podcastRoutes'
import { usePodcastDetail } from './usePodcastDetail'
import { usePodcastEpisodePages } from './usePodcastEpisodePages'

const PODCAST_SHOW_EPISODE_PREVIEW_LIMIT = 8

type EpisodesSectionState =
  | { status: 'loading' }
  | { status: 'error'; error: Error }
  | { status: 'empty' }
  | { status: 'ready'; episodes: Episode[]; hasMoreEpisodes: boolean }

export interface ResolvedPodcastShowHeroContent {
  podcast: Podcast
  snapshot: EditorPickPodcast | undefined
  artworkUrl: string
  canonicalPodcastId: string
  rawDescription: string
  episodesRoute: ReturnType<typeof buildPodcastEpisodesRoute>
}

interface UsePodcastShowContentResult {
  resolvedHeroContent: ResolvedPodcastShowHeroContent | null
  isLoadingHero: boolean
  heroError: Error | null
  notFound: 'podcast' | null
  episodesSection: EpisodesSectionState
}

export function usePodcastShowContent(
  podcastItunesId: string,
  routeCountry: string | undefined,
  routeState: unknown
): UsePodcastShowContentResult {
  const queryClient = useQueryClient()
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)

  const snapshot =
    getEditorPickRouteState(routeState)?.editorPickSnapshot ||
    (normalizedRouteCountry
      ? getCachedEditorPickByItunesID(queryClient, normalizedRouteCountry, podcastItunesId)
      : undefined)
  const initialPodcast = snapshot ? mapEditorPickToPodcast(snapshot) : undefined
  const {
    podcast,
    isLoadingPodcast,
    isFetchingPodcast,
    podcastError,
    normalizedRouteCountry: detailCountry,
  } = usePodcastDetail({
    podcastItunesId,
    routeCountry,
    initialPodcast,
  })
  const {
    episodes,
    isLoading: isLoadingEpisodes,
    isFetching: isFetchingEpisodes,
    error: episodesError,
    hasNextPage,
  } = usePodcastEpisodePages({
    podcastItunesId,
    routeCountry: detailCountry ?? undefined,
    podcast: detailCountry ? podcast : null,
  })

  const resolvedHeroContent = podcast
    ? {
        podcast,
        snapshot,
        artworkUrl: getDiscoveryArtworkUrl(podcast.artwork, 600),
        canonicalPodcastId: getCanonicalEditorPickPodcastID(podcast),
        rawDescription: podcast.description,
        episodesRoute: buildPodcastEpisodesRoute({
          country: routeCountry,
          podcastId: getCanonicalEditorPickPodcastID(podcast),
        }),
      }
    : null

  const episodesSection: EpisodesSectionState =
    isLoadingPodcast || isFetchingPodcast || isLoadingEpisodes || isFetchingEpisodes
      ? { status: 'loading' }
      : episodesError
        ? { status: 'error', error: episodesError as Error }
        : episodes.length > 0
          ? {
              status: 'ready',
              episodes: episodes.slice(0, PODCAST_SHOW_EPISODE_PREVIEW_LIMIT),
              hasMoreEpisodes: episodes.length > PODCAST_SHOW_EPISODE_PREVIEW_LIMIT || hasNextPage,
            }
          : { status: 'empty' }

  return {
    resolvedHeroContent,
    isLoadingHero: isLoadingPodcast,
    heroError: podcastError,
    notFound: !isLoadingPodcast && !podcastError && !podcast ? 'podcast' : null,
    episodesSection,
  }
}
