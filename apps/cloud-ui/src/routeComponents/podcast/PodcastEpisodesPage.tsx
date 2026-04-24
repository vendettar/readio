import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import { EpisodeRow } from '../../components/EpisodeRow/EpisodeRow'
import { Button } from '../../components/ui/button'
import { LoadingSpinner } from '../../components/ui/loading-spinner'
import discovery, { type FeedEpisode, type ParsedFeed } from '../../lib/discovery'
import {
  PODCAST_DEFAULT_FEED_QUERY_LIMIT,
  buildPodcastFeedQueryKey,
  buildPodcastDetailQueryKey,
  PODCAST_QUERY_CACHE_POLICY,
} from '../../lib/discovery/podcastQueryContract'
import { logError } from '../../lib/logger'
import { buildPodcastEpisodesRoute, normalizeCountryParam } from '../../lib/routes/podcastRoutes'
import { useExploreStore } from '../../store/exploreStore'

const UNKNOWN_YEAR = -1
const PODCAST_EPISODES_PAGE_SIZE = PODCAST_DEFAULT_FEED_QUERY_LIMIT

export type ListRow =
  | { type: 'year-header'; year: number; key: string }
  | { type: 'episode'; episode: FeedEpisode; isLastInYear: boolean; key: string }

function resolveEpisodeYear(pubDate: string): number {
  const year = new Date(pubDate).getFullYear()
  return Number.isFinite(year) ? year : UNKNOWN_YEAR
}

function getEpisodeRowKey(episode: FeedEpisode | undefined, index: number): string {
  if (!episode) return `temp-key-${index}`
  return episode.episodeGuid || `${episode.audioUrl}-${episode.pubDate}-${index}`
}

function buildListRows(episodes: FeedEpisode[]): ListRow[] {
  const rows: ListRow[] = []
  let currentYear: number | null = null

  for (let i = 0; i < episodes.length; i++) {
    const episode = episodes[i]
    const year = resolveEpisodeYear(episode.pubDate)

    if (year !== currentYear) {
      rows.push({ type: 'year-header', year, key: `header-${year}-${i}` })
      currentYear = year
    }

    const nextEp = episodes[i + 1]
    const isLastInYear = !nextEp || resolveEpisodeYear(nextEp.pubDate) !== year
    rows.push({
      type: 'episode',
      episode,
      isLastInYear,
      key: getEpisodeRowKey(episode, i),
    })
  }

  return rows
}

export default function PodcastEpisodesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const params = useParams({ strict: false })
  const routeCountry = (params as { country?: string }).country
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)
  const id = String((params as { id?: string }).id ?? '')
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)
  const hasUserScrolledForPaginationRef = useRef(false)
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
  useEffect(() => {
    hasUserScrolledForPaginationRef.current = false
  }, [id, feedUrl])

  const firstPageQueryKey = buildPodcastFeedQueryKey(feedUrl, {
    limit: PODCAST_EPISODES_PAGE_SIZE,
    offset: 0,
  })
  const cachedFirstPage = feedUrl
    ? (queryClient.getQueryData(firstPageQueryKey) as ParsedFeed | undefined)
    : undefined
  const cachedFirstPageUpdatedAt = feedUrl
    ? queryClient.getQueryState(firstPageQueryKey)?.dataUpdatedAt
    : undefined
  const {
    data: pagedFeed,
    isLoading: isLoadingFeed,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: feedError,
  } = useInfiniteQuery({
    // Keep the infinite list key distinct from the single-page show-page key.
    queryKey: [
      ...firstPageQueryKey,
      'infinite',
    ],
    initialPageParam: 0,
    initialData: cachedFirstPage
      ? ({
          pages: [cachedFirstPage],
          pageParams: [0],
        } satisfies InfiniteData<ParsedFeed, number>)
      : undefined,
    initialDataUpdatedAt: cachedFirstPageUpdatedAt,
    queryFn: ({ signal, pageParam }) =>
      discovery.fetchPodcastFeed(feedUrl ?? '', signal, {
        limit: PODCAST_EPISODES_PAGE_SIZE,
        offset: typeof pageParam === 'number' ? pageParam : 0,
      }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.pageInfo) {
        if (!lastPage.pageInfo.hasMore) {
          return undefined
        }
        return lastPage.pageInfo.offset + lastPage.pageInfo.returned
      }
      if (lastPage.episodes.length < PODCAST_EPISODES_PAGE_SIZE) {
        return undefined
      }
      return allPages.reduce((count, page) => count + page.episodes.length, 0)
    },
    enabled: Boolean(podcast?.feedUrl && normalizedRouteCountry),
    staleTime: PODCAST_QUERY_CACHE_POLICY.feed.staleTime,
    gcTime: PODCAST_QUERY_CACHE_POLICY.feed.gcTime,
  })

  const episodes = useMemo(() => {
    // Feed order is canonical. Flatten loaded pages without client-side sorting.
    return pagedFeed?.pages.flatMap((page) => page.episodes) ?? []
  }, [pagedFeed?.pages])

  const listRows = useMemo(() => buildListRows(episodes), [episodes])

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
  const firstFeedPage = pagedFeed?.pages[0]
  const hasEpisodes = listRows.length > 0
  const isRegionUnavailable =
    !feedError &&
    Boolean(firstFeedPage) &&
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
      onScroll={() => {
        hasUserScrolledForPaginationRef.current = true
      }}
      className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar"
    >
      <div className="w-full max-w-content mx-auto px-page pt-page">
        <div className="flex flex-col">
          {scrollContainer && (
            <Virtuoso
              data={listRows}
              customScrollParent={scrollContainer}
              atBottomStateChange={(atBottom) => {
                if (
                  atBottom &&
                  hasUserScrolledForPaginationRef.current &&
                  hasNextPage &&
                  !isFetchingNextPage
                ) {
                  void fetchNextPage()
                }
              }}
              computeItemKey={(_, item) => item.key}
              components={{
                Footer: () => (
                  <div className="pb-32 pt-4 flex items-center justify-center">
                    {isFetchingNextPage ? (
                      <div
                        data-testid="podcast-episodes-page-loading-more"
                        className="flex items-center justify-center"
                      >
                        <LoadingSpinner size="sm" />
                      </div>
                    ) : null}
                  </div>
                ),
              }}
              itemContent={(_, row) => {
                if (row.type === 'year-header') {
                  return (
                    <div className="py-4">
                      <h2 className="text-lg font-bold text-foreground">
                        {row.year === UNKNOWN_YEAR ? t('unknownTitle') : row.year}
                      </h2>
                    </div>
                  )
                }

                return (
                  <EpisodeRow
                    episode={row.episode}
                    podcast={podcast}
                    isLast={row.isLastInYear}
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
