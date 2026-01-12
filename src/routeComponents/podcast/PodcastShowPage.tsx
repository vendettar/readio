// src/routes/podcast/$id/index.tsx
// Premium-style podcast show page with episode list

import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { Check, ChevronRight, Play, Plus } from 'lucide-react'
import React, { useState } from 'react'
import { EpisodeCard } from '../../components/Explore/EpisodeCard'
import { Button } from '../../components/ui/button'
import { useEpisodePlayback } from '../../hooks/useEpisodePlayback'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { fetchPodcastFeed, lookupPodcastFull } from '../../libs/discoveryProvider'
import { formatCompactNumber } from '../../libs/formatters'
import { stripHtml } from '../../libs/htmlUtils'
import { getDiscoveryArtworkUrl } from '../../libs/imageUtils'
import { toast } from '../../libs/toast'
import { useExploreStore } from '../../store/exploreStore'

export default function PodcastShowPage() {
  const { t } = useI18n()
  const { id } = useParams({ from: '/podcast/$id/' })
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

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

  // Fetch episodes via RSS feed (only when we have feedUrl)
  const feedUrl = podcast?.feedUrl
  const {
    data: feed,
    isLoading: isLoadingFeed,
    error: feedError,
  } = useQuery({
    queryKey: ['podcast', 'feed', podcast?.feedUrl],
    queryFn: () => fetchPodcastFeed(feedUrl ?? ''),
    enabled: !!podcast?.feedUrl,
    staleTime: 1000 * 60 * 30, // 30 minutes
    gcTime: 1000 * 60 * 60 * 6, // 6 hours
  })

  // Subscription state
  const subscriptions = useExploreStore((state) => state.subscriptions)
  const subscribe = useExploreStore((state) => state.subscribe)
  const unsubscribe = useExploreStore((state) => state.unsubscribe)
  const isSubscribed = podcast ? subscriptions.some((s) => s.feedUrl === podcast.feedUrl) : false

  // Player actions
  const { playEpisode } = useEpisodePlayback()

  const handleSubscribe = async () => {
    if (!podcast) return
    try {
      if (isSubscribed) {
        await unsubscribe(podcast.feedUrl)
      } else {
        await subscribe(podcast)
      }
    } catch {
      toast.errorKey(isSubscribed ? 'toastUnsubscribeFailed' : 'toastSubscribeFailed')
    }
  }

  // Loading state
  if (isLoadingPodcast) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          {/* Hero skeleton */}
          <div className="flex flex-col md:flex-row gap-8 mb-10">
            <div className="w-full md:w-64 aspect-square bg-muted rounded-2xl animate-shimmer flex-shrink-0" />
            <div className="flex-1 space-y-4">
              <div className="h-8 w-3/4 bg-muted rounded animate-shimmer" />
              <div className="h-5 w-1/2 bg-muted rounded animate-shimmer" />
              <div className="h-10 w-32 bg-muted rounded animate-shimmer" />
            </div>
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

  // Get artwork URL
  const artworkUrl = getDiscoveryArtworkUrl(podcast.artworkUrl600 || podcast.artworkUrl100, 600)

  // Description with HTML stripping (using line-clamp in CSS, not truncation)
  const rawDescription = feed?.description || ''
  const cleanDescription = stripHtml(rawDescription)
  const shouldTruncateDescription = cleanDescription.length > 200 // Show MORE if long enough

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div
        className="py-10 sm:py-14 max-w-screen-2xl mx-auto"
        style={{ paddingLeft: 'var(--page-margin-x)', paddingRight: 'var(--page-margin-x)' }}
      >
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Artwork */}
          <div className="w-full md:w-64 flex-shrink-0">
            <img
              src={artworkUrl}
              alt=""
              className="w-full aspect-square rounded-2xl object-cover shadow-lg bg-muted"
            />
          </div>

          {/* Metadata - Use flex column with justify-between to push buttons to bottom */}
          <div className="flex-1 flex flex-col justify-between">
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-0.5">
                  {podcast.collectionName}
                </h1>
                <p className="text-xl font-bold text-primary">{podcast.artistName}</p>
                {/* Meta badges/text */}
                <div className="flex items-center gap-2 mt-2 text-xs font-medium text-muted-foreground tracking-tight">
                  <span>
                    {podcast.primaryGenreName || podcast.genres?.[0] || t('podcastLabel')}
                  </span>
                </div>
              </div>

              {/* Description - Adjusted width to md for exact text wrap parity */}
              {cleanDescription && (
                <div className="mt-4 relative max-w-md group">
                  <div
                    className={cn(
                      'text-xs text-foreground/90 dark:text-white/70 leading-relaxed whitespace-pre-wrap font-light',
                      !isDescriptionExpanded && shouldTruncateDescription && 'line-clamp-3'
                    )}
                  >
                    {cleanDescription}
                  </div>
                  {!isDescriptionExpanded && shouldTruncateDescription && (
                    <div className="absolute bottom-0 right-0 flex items-end">
                      {/* Precision fade effect only on the last line before "MORE" - Matches background */}
                      <div className="w-16 h-5 bg-gradient-to-r from-transparent via-background/80 to-background" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsDescriptionExpanded(true)}
                        className="text-xs text-primary hover:underline font-bold h-auto p-0 bg-background pr-0.5 tracking-tight uppercase hover:bg-transparent"
                      >
                        {t('showMore')}
                      </Button>
                    </div>
                  )}
                  {isDescriptionExpanded && (
                    <Button
                      variant="link"
                      onClick={() => setIsDescriptionExpanded(false)}
                      className="text-xs text-primary h-auto p-0 mt-1"
                    >
                      {t('showLess')}
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Primary Interactions - Aligned to bottom */}
            <div className="flex items-end gap-3 pt-6 pr-4">
              {feed?.episodes?.[0] && (
                <Button
                  onClick={() => playEpisode(feed.episodes[0], podcast)}
                  className="rounded-md bg-primary hover:opacity-90 text-primary-foreground px-5 h-8 font-bold text-xs flex items-center gap-1.5 shadow-none transition-all active:scale-95"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {t('latestEpisode')}
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={handleSubscribe}
                className={cn(
                  'h-8 rounded-full text-primary font-bold text-xs active:scale-95 bg-muted/70 hover:bg-muted transition-all duration-300 ease-out overflow-hidden ml-auto',
                  isSubscribed ? 'w-8 p-0' : 'px-3'
                )}
                aria-label={isSubscribed ? t('unsubscribe') : t('subscribe')}
              >
                <div
                  className={cn(
                    'flex items-center justify-center',
                    isSubscribed ? 'w-full h-full' : 'gap-1.5'
                  )}
                >
                  {/* Icon - morphs between Plus and Check */}
                  <div
                    className={cn(
                      'relative flex items-center justify-center flex-shrink-0',
                      isSubscribed ? 'w-5 h-5' : 'w-4 h-4'
                    )}
                  >
                    <Plus
                      className={cn(
                        'w-4 h-4 stroke-2 absolute inset-0 m-auto transition-all duration-300',
                        isSubscribed
                          ? 'opacity-0 rotate-90 scale-0'
                          : 'opacity-100 rotate-0 scale-100'
                      )}
                    />
                    <Check
                      className={cn(
                        'w-5 h-5 stroke-[3] absolute inset-0 m-auto transition-all duration-300',
                        isSubscribed
                          ? 'opacity-100 rotate-0 scale-100'
                          : 'opacity-0 -rotate-90 scale-0'
                      )}
                    />
                  </div>
                  {/* Text - hidden when subscribed */}
                  {!isSubscribed && <span className="whitespace-nowrap">{t('subscribe')}</span>}
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* Episodes Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            {feed?.episodes && feed.episodes.length > 8 ? (
              <Button asChild variant="ghost" className="p-0 h-auto hover:bg-transparent">
                <Link
                  to="/podcast/$id/episodes"
                  params={{ id }}
                  className="group flex items-center gap-1"
                >
                  <h2 className="text-xl font-bold">{t('episodesTitle')}</h2>
                  <ChevronRight
                    size={20}
                    className="text-muted-foreground group-hover:text-foreground transition-colors"
                  />
                </Link>
              </Button>
            ) : (
              <h2 className="text-xl font-bold">{t('episodesTitle')}</h2>
            )}
          </div>

          {isLoadingFeed ? (
            <div className="space-y-3">
              {[
                'feed-skeleton-1',
                'feed-skeleton-2',
                'feed-skeleton-3',
                'feed-skeleton-4',
                'feed-skeleton-5',
              ].map((key) => (
                <div key={key} className="p-4 rounded-lg bg-muted/50 animate-shimmer">
                  <div className="h-5 w-3/4 bg-muted rounded mb-2" />
                  <div className="h-4 w-1/2 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : feedError ? (
            <p className="text-muted-foreground py-8 text-center">{t('errorFeedLoadFailed')}</p>
          ) : feed?.episodes && feed.episodes.length > 0 ? (
            <div className="flex flex-col">
              {feed.episodes.slice(0, 8).map((episode) => (
                <EpisodeCard
                  key={episode.id}
                  episode={episode}
                  podcast={podcast}
                  onPlay={() => playEpisode(episode, podcast)}
                />
              ))}

              {/* See All Button - Only show if there are more than 8 episodes */}
              {feed?.episodes && feed.episodes.length > 8 && (
                <div className="pt-2">
                  <Button
                    asChild
                    variant="link"
                    className="text-primary font-medium text-sm p-0 h-auto"
                  >
                    <Link to="/podcast/$id/episodes" params={{ id }}>
                      {t('seeAll', {
                        count: formatCompactNumber(podcast.trackCount || feed.episodes.length),
                      })}
                    </Link>
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
