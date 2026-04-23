// src/components/Explore/EditorPickShowsCarousel.tsx

import { useCarouselLayout } from '../../hooks/useCarouselLayout'
import type { EditorPickPodcast } from '../../lib/discovery'
import { PodcastCardSkeleton } from '../PodcastCard/PodcastCardSkeleton'
import { CarouselShell } from './CarouselShell'
import { EditorPickShowCard } from './EditorPickShowCard'

interface EditorPickShowsCarouselProps {
  podcasts: EditorPickPodcast[]
  isLoading?: boolean
  sectionId?: string
}

export function EditorPickShowsCarousel({
  podcasts,
  isLoading,
  sectionId,
}: EditorPickShowsCarouselProps) {
  const {
    scrollRef,
    itemWidth,
    visibleCount,
    canScrollLeft,
    canScrollRight,
    handleScroll,
    updateScrollButtons,
  } = useCarouselLayout(podcasts.length)

  const skeletonCount = visibleCount || 7

  return (
    <CarouselShell
      scrollRef={scrollRef}
      onScrollUpdate={updateScrollButtons}
      cssVarName="--item-width"
      itemWidth={itemWidth}
      wrapperClassName="group/carousel"
      viewportClassName="flex gap-4 overflow-x-auto scrollbar-none py-1 scroll-smooth snap-x snap-mandatory"
      showNavigation={!isLoading}
      canScrollLeft={canScrollLeft}
      canScrollRight={canScrollRight}
      onNavigate={handleScroll}
      navTopClassName="top-[calc(var(--item-width)/2)]"
    >
      {isLoading
        ? Array.from({ length: 10 })
            .slice(0, skeletonCount)
            .map((_, i) => (
              <PodcastCardSkeleton
                key={`car-skeleton-${i}`}
                className="flex-shrink-0 w-[var(--item-width)] snap-start"
              />
            ))
        : podcasts.map((podcast, index) => (
            <EditorPickShowCard
              key={`${sectionId || 'default'}-${podcast.podcastItunesId}`}
              podcast={podcast}
              index={index}
              transitionState={sectionId ? { fromLayoutPrefix: sectionId } : undefined}
            />
          ))}
    </CarouselShell>
  )
}
