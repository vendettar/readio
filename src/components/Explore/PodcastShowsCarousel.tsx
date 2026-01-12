// src/components/Explore/TopShowsCarousel.tsx
// Horizontal carousel of podcasts (standard image format)

import type React from 'react'
import { CAROUSEL_DEFAULTS } from '../../constants/layout'
import { useCarouselLayout } from '../../hooks/useCarouselLayout'
import type { DiscoveryPodcast } from '../../libs/discoveryProvider'
import { CarouselNavigation } from './CarouselNavigation'
import { PodcastShowCard } from './PodcastShowCard'

interface TopShowsCarouselProps {
  podcasts: DiscoveryPodcast[]
  isLoading?: boolean
  onPlayLatest?: (podcast: DiscoveryPodcast) => void
  onSubscribe?: (podcast: DiscoveryPodcast) => void
}

export function PodcastShowsCarousel({
  podcasts,
  isLoading,
  onPlayLatest,
  onSubscribe,
}: TopShowsCarouselProps) {
  const {
    scrollRef,
    visibleCount,
    canScrollLeft,
    canScrollRight,
    handleScroll,
    updateScrollButtons,
  } = useCarouselLayout(podcasts.length)

  if (isLoading) {
    const skeletonCount = visibleCount || 7
    return (
      <div className="flex gap-4 overflow-hidden py-1">
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div
            key={i}
            className="flex-shrink-0 flex flex-col gap-2 w-[var(--item-width)]"
            style={
              { '--item-width': `${CAROUSEL_DEFAULTS.MAX_ITEM_WIDTH}px` } as React.CSSProperties
            }
          >
            <div className="aspect-square w-full bg-muted rounded-xl animate-shimmer" />
            <div className="h-4 bg-muted rounded w-3/4 mx-1 animate-shimmer" />
            <div className="h-3 bg-muted rounded w-1/2 mx-1 animate-shimmer" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="relative group/carousel">
      {/* Scroll Container */}
      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        className="flex gap-4 overflow-x-auto scrollbar-none py-1 scroll-smooth snap-x snap-mandatory"
      >
        {podcasts.map((podcast, index) => (
          <PodcastShowCard
            key={podcast.id}
            podcast={podcast}
            index={index}
            onPlayLatest={onPlayLatest}
            onSubscribe={onSubscribe}
          />
        ))}
      </div>

      {/* Navigation Buttons */}
      <CarouselNavigation
        canScrollLeft={canScrollLeft}
        canScrollRight={canScrollRight}
        onScroll={handleScroll}
      />
    </div>
  )
}
