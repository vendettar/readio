import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GroupedVirtuoso } from 'react-virtuoso'
import { EpisodeRow } from '../../components/EpisodeRow/EpisodeRow'
import { Button } from '../../components/ui/button'
import discovery, { type FeedEpisode } from '../../lib/discovery'
import {
  buildPodcastFeedQueryKey,
  buildPodcastDetailQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from '../../lib/discovery/podcastQueryContract'
import { logError } from '../../lib/logger'
import { buildPodcastEpisodesRoute, normalizeCountryParam } from '../../lib/routes/podcastRoutes'
import { useExploreStore } from '../../store/exploreStore'

const UNKNOWN_YEAR = -1

interface GroupedEpisodeData {
  flattenedEpisodes: FeedEpisode[]
  groupCounts: number[]
  groupYears: number[]
  /** Cumulative item offset at the start of each group (for converting flat index → within-group index). */
  groupStartOffsets: number[]
}

function resolveEpisodeYear(pubDate: string): number {
  const year = new Date(pubDate).getFullYear()
  return Number.isFinite(year) ? year : UNKNOWN_YEAR
}

function buildGroupedEpisodeData(episodes: FeedEpisode[]): GroupedEpisodeData {
  const groupCounts: number[] = []
  const groupYears: number[] = []

  let currentYear: number | null = null
  let currentCount = 0

  for (const episode of episodes) {
    const year = resolveEpisodeYear(episode.pubDate)
    if (currentYear === null || year !== currentYear) {
      if (currentYear !== null) {
        groupYears.push(currentYear)
        groupCounts.push(currentCount)
      }
      currentYear = year
      currentCount = 1
      continue
    }

    currentCount += 1
  }

  if (currentYear !== null) {
    groupYears.push(currentYear)
    groupCounts.push(currentCount)
  }

  // Precompute cumulative start offsets so we can derive within-group index from the flat index
  const groupStartOffsets: number[] = []
  let cumulative = 0
  for (const count of groupCounts) {
    groupStartOffsets.push(cumulative)
    cumulative += count
  }

  return {
    flattenedEpisodes: episodes,
    groupCounts,
    groupYears,
    groupStartOffsets,
  }
}

function getEpisodeRowKey(episode: FeedEpisode | undefined, index: number): string {
  if (!episode) return `temp-key-${index}`
  return episode.episodeGuid || `${episode.audioUrl}-${episode.pubDate}-${index}`
}

export default function PodcastEpisodesPage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false })
  const routeCountry = (params as { country?: string }).country
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)
  const id = String((params as { id?: string }).id ?? '')
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)
  const globalCountry = normalizeCountryParam(useExploreStore((s) => s.country))
  // Fetch podcast metadata via the active discovery path.
  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery({
    queryKey: buildPodcastDetailQueryKey(id, normalizedRouteCountry),
    queryFn: ({ signal }) => discovery.getPodcastIndexPodcastByItunesId(id, signal),
    enabled: Boolean(normalizedRouteCountry),
    staleTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.podcastDetail.gcTime,
  })

  // Fetch episodes via the active discovery path.
  const feedUrl = podcast?.feedUrl
  const {
    data: feed,
    isLoading: isLoadingFeed,
    error: feedError,
  } = useQuery({
    queryKey: buildPodcastFeedQueryKey(feedUrl),
    queryFn: ({ signal }) => discovery.fetchPodcastFeed(feedUrl ?? '', signal),
    enabled: Boolean(podcast?.feedUrl && normalizedRouteCountry),
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  const appleTotal = podcast?.episodeCount ?? 0
  const episodes = useMemo(() => feed?.episodes ?? [], [feed?.episodes])
  const groupedEpisodeData = useMemo(() => buildGroupedEpisodeData(episodes), [episodes])

  if (isLoadingPodcast || isLoadingFeed) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="mb-8">
            <div className="h-8 w-48 bg-muted rounded animate-shimmer" />
          </div>
          <div className="space-y-3">
            {[
              'episode-skeleton-1',
              'episode-skeleton-2',
              'episode-skeleton-3',
              'episode-skeleton-4',
              'episode-skeleton-5',
              'episode-skeleton-6',
              'episode-skeleton-7',
              'episode-skeleton-8',
              'episode-skeleton-9',
              'episode-skeleton-10',
            ].map((key) => (
              <div key={key} className="p-4 rounded-lg bg-muted/50 animate-shimmer">
                <div className="h-5 w-3/4 bg-muted rounded mb-2" />
                <div className="h-4 w-1/2 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (podcastError || feedError || !podcast) {
    if (import.meta.env.DEV) {
      logError('[PodcastEpisodesPage] route_error_state', {
        reason: podcastError
          ? 'lookup_failed'
          : feedError
            ? 'feed_or_provider_failed'
            : 'not_found',
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

  const recoveryRoute = buildPodcastEpisodesRoute({
    country: globalCountry,
    podcastId: id,
  })
  const hasEpisodes = groupedEpisodeData.flattenedEpisodes.length > 0
  const isRegionUnavailable =
    !feedError &&
    Boolean(feed) &&
    !isLoadingFeed &&
    Boolean(normalizedRouteCountry && globalCountry && normalizedRouteCountry !== globalCountry) &&
    !hasEpisodes

  if (isRegionUnavailable) {
    if (import.meta.env.DEV) {
      logError('[PodcastEpisodesPage] route_region_unavailable', {
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
            {recoveryRoute && (
              <Button asChild>
                <Link to={recoveryRoute.to} params={recoveryRoute.params}>
                  {t('regionUnavailableCta')}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (!hasEpisodes) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('noEpisodes')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setScrollContainer}
      className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar"
    >
      <div className="w-full max-w-content mx-auto px-page pt-page">
        <div className="flex flex-col">
          {scrollContainer && (
            <GroupedVirtuoso
              data={groupedEpisodeData.flattenedEpisodes}
              groupCounts={groupedEpisodeData.groupCounts}
              customScrollParent={scrollContainer}
              computeItemKey={(index, episode) => getEpisodeRowKey(episode, index)}
              components={{
                Footer: () => <div className="pb-32" />,
              }}
              groupContent={(groupIndex) => (
                <div className="py-4">
                  <h2 className="text-lg font-bold text-foreground">
                    {groupedEpisodeData.groupYears[groupIndex] === UNKNOWN_YEAR
                      ? t('unknownTitle')
                      : groupedEpisodeData.groupYears[groupIndex]}
                  </h2>
                </div>
              )}
              itemContent={(index, groupIndex, episode) => {
                if (!episode) return null
                const groupSize = groupedEpisodeData.groupCounts[groupIndex] ?? 0
                const groupStart = groupedEpisodeData.groupStartOffsets[groupIndex] ?? 0
                const indexInGroup = index - groupStart
                return (
                  <EpisodeRow
                    episode={episode}
                    podcast={podcast}
                    isLast={indexInGroup === groupSize - 1}
                  />
                )
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
