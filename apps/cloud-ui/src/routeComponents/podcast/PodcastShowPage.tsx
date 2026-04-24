// src/routes/podcast/$country/$id/index.tsx
// Premium-style podcast show page with episode list

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useParams } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Check, ChevronRight, Play, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EpisodeRow } from '../../components/EpisodeRow/EpisodeRow'
import { EpisodeRowSkeleton } from '../../components/EpisodeRow/EpisodeRowSkeleton'
import { ActionToggle } from '../../components/ui/action-toggle'
import { Button } from '../../components/ui/button'
import { ExpandableDescription } from '../../components/ui/expandable-description'
import { Skeleton } from '../../components/ui/skeleton'
import { useEpisodePlayback } from '../../hooks/useEpisodePlayback'
import discovery, { type FeedEpisode } from '../../lib/discovery'
import {
  getCachedEditorPickByItunesID,
  getCanonicalEditorPickPodcastID,
  getEditorPickRouteState,
  mapEditorPickToPodcast,
} from '../../lib/discovery/editorPicks'
import {
  buildPodcastFeedQueryKey,
  buildPodcastDetailQueryKey,
  PODCAST_DEFAULT_FEED_QUERY_LIMIT,
  PODCAST_QUERY_CACHE_POLICY,
} from '../../lib/discovery/podcastQueryContract'
import { formatCompactNumber } from '../../lib/formatters'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'

function getEpisodeRowKey(episode: FeedEpisode): string {
  return episode.episodeGuid
}

import { logError } from '../../lib/logger'
import {
  buildPodcastEpisodesRoute,
  buildPodcastShowRoute,
  normalizeCountryParam,
} from '../../lib/routes/podcastRoutes'
import { toast } from '../../lib/toast'
import { useExploreStore } from '../../store/exploreStore'

interface PodcastShowTransitionState {
  fromLayoutPrefix?: string
}

export function resolveLayoutPrefixFromState(state: unknown): string | undefined {
  if (!state || typeof state !== 'object') return undefined
  const value = (state as PodcastShowTransitionState).fromLayoutPrefix
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export default function PodcastShowPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const params = useParams({ strict: false })
  const routeCountry = (params as { country?: string }).country
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)
  const id = String((params as { id?: string }).id ?? '')
  const location = useLocation()
  const fromLayoutPrefix = resolveLayoutPrefixFromState(location.state)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const queryClient = useQueryClient()

  // Optimization: If navigating from Editor's Picks, use the snapshot from state or cache
  // to bootstrap initial data while still performing authoritative PI byitunesid enrichment.
  const snapshot =
    getEditorPickRouteState(location.state)?.editorPickSnapshot ||
    getCachedEditorPickByItunesID(queryClient, normalizedRouteCountry, id)
  const initialPodcast = snapshot ? mapEditorPickToPodcast(snapshot) : undefined

  // Fetch podcast metadata via the active discovery path.
  // NOTE: PI byitunesid lookup ALWAYS runs when canonical iTunes ID exists - snapshot is only a bootstrap hint,
  // not a replacement for authoritative enrichment.
  const {
    data: queryData,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery({
    queryKey: buildPodcastDetailQueryKey(id, normalizedRouteCountry),
    queryFn: ({ signal }) => discovery.getPodcastIndexPodcastByItunesId(id, signal),
    initialData: initialPodcast,
    // Always fetch when we have a route ID - snapshot bootstraps but doesn't replace authoritative lookup
    enabled: Boolean(normalizedRouteCountry && id),
    staleTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.gcTime,
  })

  const podcast = useMemo(() => queryData || initialPodcast, [initialPodcast, queryData])

  const feedUrl = podcast?.feedUrl

  const {
    data: feed,
    isLoading: isLoadingFeed,
    error: feedError,
  } = useQuery({
    queryKey: buildPodcastFeedQueryKey(feedUrl, {
      limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
      offset: 0,
    }),
    queryFn: ({ signal }) =>
      discovery.fetchPodcastFeed(feedUrl ?? '', signal, {
        limit: PODCAST_DEFAULT_FEED_QUERY_LIMIT,
        offset: 0,
      }),
    enabled: Boolean(podcast?.feedUrl && normalizedRouteCountry),
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  const episodes = feed?.episodes ?? []

  // Subscription state
  const subscriptions = useExploreStore((state) => state.subscriptions)
  const subscribe = useExploreStore((state) => state.subscribe)
  const unsubscribe = useExploreStore((state) => state.unsubscribe)
  const globalCountry = normalizeCountryParam(useExploreStore((state) => state.country))
  const isSubscribed = podcast ? subscriptions.some((s) => s.feedUrl === podcast.feedUrl) : false

  // Player actions
  const { playEpisode } = useEpisodePlayback()

  const handleSubscribe = async () => {
    if (!podcast) return
    const action = isSubscribed ? 'unsubscribe' : 'subscribe'
    try {
      if (isSubscribed) {
        if (podcast.feedUrl) {
          await unsubscribe(podcast.feedUrl)
        }
      } else {
        await subscribe(podcast, undefined, normalizedRouteCountry)
      }
    } catch (err) {
      logError(`[PodcastShowPage] Failed to ${action}`, {
        podcastId: podcast.podcastItunesId,
        feedUrl: podcast.feedUrl,
        error: err,
      })
      toast.errorKey(isSubscribed ? 'toastUnsubscribeFailed' : 'toastSubscribeFailed')
    }
  }

  // Loading state
  if (isLoadingPodcast) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="w-full max-w-content mx-auto px-page pt-page pb-32">
          {/* Hero skeleton */}
          <div className="flex flex-col md:flex-row gap-8 mb-10">
            <Skeleton className="w-40 sm:w-48 md:w-64 aspect-square rounded-2xl flex-shrink-0" />
            <div className="flex-1 flex flex-col justify-between py-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-8 w-3/4 rounded-lg" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="mt-4 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
              <div className="flex gap-3 pt-6">
                <Skeleton className="h-8 w-32 rounded-md" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </div>
          </div>

          {/* Episodes Section Skeleton */}
          <section>
            <Skeleton className="h-7 w-40 mb-6" />
            <div className="space-y-0">
              {['hero-ep-1', 'hero-ep-2', 'hero-ep-3', 'hero-ep-4', 'hero-ep-5', 'hero-ep-6'].map(
                (key) => (
                  <EpisodeRowSkeleton key={key} />
                )
              )}
            </div>
          </section>
        </div>
      </div>
    )
  }

  // Error state
  if (podcastError || feedError || !podcast) {
    if (import.meta.env.DEV) {
      logError('[PodcastShowPage] route_error_state', {
        reason: podcastError ? 'lookup_failed' : feedError ? 'feed_failed' : 'not_found',
        podcastId: id,
        country: normalizedRouteCountry,
      })
    }
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('errorPodcastUnavailable')}</p>
          </div>
        </div>
      </div>
    )
  }

  // Get artwork URL
  const artworkUrl = getDiscoveryArtworkUrl(podcast.artwork, 600)
  const canonicalPodcastId = getCanonicalEditorPickPodcastID(podcast) || id

  const rawDescription = feed?.description || ''
  const episodesRoute = buildPodcastEpisodesRoute({
    country: routeCountry,
    podcastId: canonicalPodcastId,
  })
  const regionRecoveryRoute = buildPodcastShowRoute({
    country: globalCountry,
    podcastId: canonicalPodcastId,
  })
  const isRegionUnavailable =
    !feedError &&
    Boolean(feed) &&
    !isLoadingFeed &&
    Boolean(normalizedRouteCountry && globalCountry && normalizedRouteCountry !== globalCountry) &&
    !(episodes.length > 0)

  if (isRegionUnavailable) {
    if (import.meta.env.DEV) {
      logError('[PodcastShowPage] route_region_unavailable', {
        reason: 'route_country_content_unavailable',
        podcastId: id,
        routeCountry: normalizedRouteCountry,
        globalCountry,
      })
    }
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20 space-y-4">
            <p className="text-lg text-muted-foreground">{t('regionUnavailableMessage')}</p>
            {regionRecoveryRoute && (
              <Button asChild>
                <Link to={regionRecoveryRoute.to} params={regionRecoveryRoute.params}>
                  {t('regionUnavailableCta')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="w-full max-w-content mx-auto px-page pt-page pb-32">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Artwork */}
          <div className="w-40 sm:w-48 md:w-64 flex-shrink-0">
            <motion.div
              layoutId={
                fromLayoutPrefix
                  ? `artwork-podcast-${fromLayoutPrefix}-${id}`
                  : `artwork-podcast-${id}`
              }
              className="w-full aspect-square"
            >
              <img
                src={artworkUrl}
                alt=""
                className="w-full h-full rounded-2xl object-cover shadow-lg bg-muted"
              />
            </motion.div>
          </div>

          {/* Metadata - Use flex column with justify-between to push buttons to bottom */}
          <div className="flex-1 flex flex-col justify-between">
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-0.5">
                  {podcast.title}
                </h1>
                <p className="text-xl font-bold text-primary">{podcast.author}</p>
                {/* Meta badges/text */}
                <div className="flex items-center gap-2 mt-2 text-xs font-medium text-muted-foreground tracking-tight">
                  <span>{String(podcast.genres?.[0] || t('podcastLabel'))}</span>
                </div>
              </div>

              {/* Description - Adjusted width to md for exact text wrap parity */}
              {rawDescription && (
                <div className="mt-4">
                  <ExpandableDescription
                    content={rawDescription}
                    mode="plain"
                    collapsedLines={3}
                    expanded={isDescriptionExpanded}
                    onExpandedChange={setIsDescriptionExpanded}
                    showMoreLabel={t('showMore')}
                    showLessLabel={t('showLess')}
                    maxWidthClassName="max-w-md"
                  />
                </div>
              )}
            </div>

            {/* Primary Interactions - Aligned to bottom */}
            <div className="flex items-end gap-3 pt-6 pe-4">
              {episodes[0] && (
                <Button
                  onClick={() => {
                    const ep = episodes[0]
                    playEpisode(ep, podcast, normalizedRouteCountry ?? undefined)
                  }}
                  className="rounded-md bg-primary hover:opacity-90 text-primary-foreground px-5 h-8 font-bold text-xs flex items-center gap-1.5 shadow-none transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {t('latestEpisode')}
                </Button>
              )}

              <ActionToggle
                active={isSubscribed}
                onToggle={handleSubscribe}
                activeIcon={Check}
                inactiveIcon={Plus}
                activeAriaLabel={t('unsubscribe')}
                inactiveAriaLabel={t('subscribe')}
                inactiveLabel={t('subscribe')}
                className="ms-auto"
              />
            </div>
          </div>
        </div>

        {/* Episodes Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            {episodes.length > 8 ? (
              <Button asChild variant="ghost" className="p-0 h-auto hover:bg-transparent">
                {episodesRoute ? (
                  <Link
                    to={episodesRoute.to}
                    params={episodesRoute.params}
                    className="group flex items-center gap-1"
                  >
                    <h2 className="text-xl font-bold">{t('episodesTitle')}</h2>
                    <ChevronRight
                      size={20}
                      className="text-muted-foreground group-hover:text-foreground transition-colors rtl:rotate-180"
                    />
                  </Link>
                ) : (
                  <span className="text-xl font-bold">{t('episodesTitle')}</span>
                )}
              </Button>
            ) : (
              <h2 className="text-xl font-bold">{t('episodesTitle')}</h2>
            )}
          </div>

          {isLoadingFeed ? (
            <div className="space-y-0">
              {['feed-ep-1', 'feed-ep-2', 'feed-ep-3', 'feed-ep-4', 'feed-ep-5'].map((key) => (
                <EpisodeRowSkeleton key={key} />
              ))}
            </div>
          ) : feedError ? (
            <p className="text-muted-foreground py-8 text-center">{t('errorFeedLoadFailed')}</p>
          ) : episodes.length > 0 ? (
            <div className="flex flex-col">
              {episodes.slice(0, 8).map((episode, index) => (
                <EpisodeRow
                  key={getEpisodeRowKey(episode)}
                  episode={episode}
                  podcast={podcast}
                  editorPickSnapshot={snapshot}
                  podcastId={id}
                  country={normalizedRouteCountry ?? undefined}
                  isLast={index === 7} // Slice is 8, so index 7 is last visual item
                />
              ))}

              {/* See All Button - Only show if there are more than 8 episodes */}
              {episodes.length > 8 && (
                <div className="pt-2">
                  <Button
                    asChild
                    variant="link"
                    className="text-primary font-medium text-sm p-0 h-auto"
                  >
                    {episodesRoute ? (
                      <Link to={episodesRoute.to} params={episodesRoute.params}>
                        {t('seeAll', {
                          total: formatCompactNumber(
                            podcast.episodeCount || episodes.length,
                            language
                          ),
                        })}
                      </Link>
                    ) : (
                      <span>
                        {t('seeAll', {
                          total: formatCompactNumber(
                            podcast.episodeCount || episodes.length,
                            language
                          ),
                        })}
                      </span>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center">{t('noEpisodes')}</p>
          )}
        </section>
      </div>
    </div>
  )
}
