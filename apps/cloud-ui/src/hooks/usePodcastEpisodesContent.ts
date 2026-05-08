import { useMemo } from 'react'
import type { Episode, Podcast } from '@/lib/discovery'
import { usePodcastDetailAndEpisodes } from './usePodcastDetailAndEpisodes'

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
}

function resolveEpisodeYear(pubDate: string): number {
  const year = new Date(pubDate).getFullYear()
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
  const { podcast, isLoadingPodcast, podcastError, episodeList, isLoadingEpisodes, episodesError } =
    usePodcastDetailAndEpisodes({
      podcastItunesId,
      routeCountry,
    })

  const listRows = useMemo(
    () => buildListRows(episodeList?.episodes ?? []),
    [episodeList?.episodes]
  )
  const resolvedContent = podcast && episodeList ? { podcast, listRows } : null
  const isLoading = isLoadingPodcast || isLoadingEpisodes
  const resolutionError = podcastError ?? episodesError ?? null
  const notFound = !isLoading && !resolutionError && !podcast ? 'podcast' : null

  return {
    resolvedContent,
    isLoading,
    resolutionError,
    notFound,
    isEmpty: resolvedContent ? resolvedContent.listRows.length === 0 : false,
  }
}
