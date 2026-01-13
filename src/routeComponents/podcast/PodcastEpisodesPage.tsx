// src/routes/podcast/$id/episodes.tsx
// See All Episodes page with infinite scroll

import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { EpisodeRow } from '../../components/EpisodeRow/EpisodeRow'
import { useEpisodePlayback } from '../../hooks/useEpisodePlayback'
import { useI18n } from '../../hooks/useI18n'
import { type Episode, fetchPodcastFeed, lookupPodcastFull } from '../../libs/discoveryProvider'
import { useExploreStore } from '../../store/exploreStore'

// Constants matching Apple Podcasts behavior
const INITIAL_LOAD_COUNT = 25
const BATCH_SIZE = 25

export default function PodcastEpisodesPage() {
  const { t } = useI18n()
  const { id } = useParams({ from: '/podcast/$id/episodes' })
  const [visibleCount, setVisibleCount] = useState(INITIAL_LOAD_COUNT)
  const loaderRef = useRef<HTMLDivElement>(null)

  // Load subscriptions on mount
  const loadSubscriptions = useExploreStore((state) => state.loadSubscriptions)
  const subscriptionsLoaded = useExploreStore((state) => state.subscriptionsLoaded)
  React.useEffect(() => {
    if (!subscriptionsLoaded) {
      loadSubscriptions()
    }
  }, [subscriptionsLoaded, loadSubscriptions])

  // Fetch podcast metadata via Lookup API
  const {
    data: podcast,
    isLoading: isLoadingPodcast,
    error: podcastError,
  } = useQuery({
    queryKey: ['podcast', 'lookup', id],
    queryFn: () => lookupPodcastFull(id),
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })

  // Fetch episodes via RSS feed
  const feedUrl = podcast?.feedUrl
  const { data: feed, isLoading: isLoadingFeed } = useQuery({
    queryKey: ['podcast', 'feed', podcast?.feedUrl],
    queryFn: () => fetchPodcastFeed(feedUrl ?? ''),
    enabled: !!podcast?.feedUrl,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 6, // 6 hours
  })

  const episodes = useMemo(() => feed?.episodes || [], [feed?.episodes])
  const hasMore = visibleCount < episodes.length

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    const loader = loaderRef.current
    if (!loader) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, episodes.length))
        }
      },
      { rootMargin: '200px' } // Trigger 200px before reaching bottom
    )

    observer.observe(loader)
    return () => observer.disconnect()
  }, [hasMore, episodes.length])

  // Group episodes by year
  const groupedEpisodes = useMemo(() => {
    const visible = episodes.slice(0, visibleCount)
    const groups: { year: number; episodes: Episode[] }[] = []
    let currentYear: number | null = null
    let currentGroup: Episode[] = []

    for (const episode of visible) {
      const year = new Date(episode.pubDate).getFullYear()
      if (year !== currentYear) {
        if (currentYear !== null && currentGroup.length > 0) {
          groups.push({ year: currentYear, episodes: currentGroup })
        }
        currentYear = year
        currentGroup = [episode]
      } else {
        currentGroup.push(episode)
      }
    }

    if (currentYear !== null && currentGroup.length > 0) {
      groups.push({ year: currentYear, episodes: currentGroup })
    }

    return groups
  }, [episodes, visibleCount])

  // Player actions
  const { playEpisode } = useEpisodePlayback()

  // Loading state
  if (isLoadingPodcast || isLoadingFeed) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          {/* Header skeleton */}
          <div className="mb-8">
            <div className="h-8 w-48 bg-muted rounded animate-shimmer" />
          </div>
          {/* Episodes skeleton */}
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

  // Error state
  if (podcastError || !podcast) {
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

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="w-full max-w-5xl mx-auto px-[var(--page-gutter-x)] pt-4 pb-32">
        {/* Episodes List Grouped by Year */}
        <div className="flex flex-col">
          {groupedEpisodes.map(({ year, episodes: yearEpisodes }) => (
            <div key={year}>
              {/* Year Header */}
              <div className="py-4">
                <h2 className="text-lg font-bold text-foreground">{year}</h2>
              </div>

              {/* Episodes for this year */}
              {yearEpisodes.map((episode, index) => (
                <EpisodeRow
                  key={episode.id}
                  episode={episode}
                  podcast={podcast}
                  onPlay={() => playEpisode(episode, podcast)}
                  isLast={index === yearEpisodes.length - 1}
                />
              ))}
            </div>
          ))}

          {/* Loading Spinner */}
          {hasMore && (
            <div ref={loaderRef} className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {/* Limited Feed Notice */}
          {!hasMore &&
            episodes.length > 0 &&
            podcast?.trackCount &&
            episodes.length < podcast.trackCount * 0.8 &&
            podcast.trackCount - episodes.length > 20 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <div className="max-w-md px-4 py-3 bg-muted/30 rounded-lg border border-border/50">
                  <p className="text-sm text-muted-foreground font-medium">
                    {t('feedLimitedAccess')}
                  </p>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
