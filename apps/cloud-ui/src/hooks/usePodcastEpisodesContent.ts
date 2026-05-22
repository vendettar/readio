import { useMemo } from 'react'
import type { Episode, Podcast } from '@/lib/discovery'
import { usePodcastDetail } from './usePodcastDetail'
import { usePodcastEpisodePages } from './usePodcastEpisodePages'

export const UNKNOWN_YEAR = -1

export type PodcastEpisodesListRow =
  | { type: 'year-header'; year: number; key: string }
  | { type: 'episode'; episode: Episode; isLastInYear: boolean; key: string }

export interface ResolvedPodcastEpisodesContent {
  podcast: Podcast
  listRows: PodcastEpisodesListRow[]
}

interface UsePodcastEpisodesContentResult {
  resolvedContent: ResolvedPodcastEpisodesContent | null
  isLoading: boolean
  resolutionError: Error | null
  notFound: 'podcast' | null
  isEmpty: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
}

function resolveEpisodeYear(pubDate: number): number {
  if (!Number.isInteger(pubDate) || pubDate <= 0) {
    return UNKNOWN_YEAR
  }

  const year = new Date(pubDate * 1000).getFullYear()
  return Number.isFinite(year) ? year : UNKNOWN_YEAR
}

function buildListRows(episodes: Episode[]): PodcastEpisodesListRow[] {
  const rows: PodcastEpisodesListRow[] = []
  let currentYear: number | null = null

  for (let i = 0; i < episodes.length; i += 1) {
    const episode = episodes[i]
    const year = resolveEpisodeYear(episode.pubDate)
    if (year !== currentYear) {
      rows.push({ type: 'year-header', year, key: `header-${year}-${i}` })
      currentYear = year
    }

    const nextEpisode = episodes[i + 1]
    const isLastInYear = !nextEpisode || resolveEpisodeYear(nextEpisode.pubDate) !== year
    rows.push({
      type: 'episode',
      episode,
      isLastInYear,
      key: episode.guid,
    })
  }

  return rows
}

export function usePodcastEpisodesContent(
  podcastItunesId: string,
  routeCountry: string | undefined
): UsePodcastEpisodesContentResult {
  const { podcast, isLoadingPodcast, podcastError } = usePodcastDetail({
    podcastItunesId,
    routeCountry,
  })
  const {
    episodes,
    isLoading: isLoadingEpisodePages,
    error: episodePagesError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = usePodcastEpisodePages({
    podcastItunesId,
    routeCountry,
    podcast,
  })

  const listRows = useMemo(() => buildListRows(episodes), [episodes])
  const resolvedContent = podcast && !isLoadingEpisodePages ? { podcast, listRows } : null
  const isLoading = isLoadingPodcast || isLoadingEpisodePages
  const resolutionError = podcastError ?? (episodePagesError as Error | null) ?? null
  const notFound = !isLoading && !resolutionError && !podcast ? 'podcast' : null

  return {
    resolvedContent,
    isLoading,
    resolutionError,
    notFound,
    isEmpty: resolvedContent ? resolvedContent.listRows.length === 0 : false,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }
}
