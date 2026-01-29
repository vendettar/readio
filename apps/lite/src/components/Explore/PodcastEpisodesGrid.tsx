// src/components/Explore/PodcastEpisodesGrid.tsx

import type React from 'react'
import { useTranslation } from 'react-i18next'
import { CAROUSEL_DEFAULTS } from '../../constants/layout'
import { useCarouselLayout } from '../../hooks/useCarouselLayout'
import type { DiscoveryPodcast } from '../../lib/discovery'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { cn } from '../../lib/utils'
import { AnimatedList } from '../bits/AnimatedList'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { CarouselNavigation } from './CarouselNavigation'

interface PodcastEpisodesGridProps {
  episodes: DiscoveryPodcast[]
  isLoading?: boolean
}

const ROWS = 3

export function PodcastEpisodesGrid({ episodes, isLoading }: PodcastEpisodesGridProps) {
  const { t } = useTranslation()

  const {
    scrollRef,
    visibleCount,
    canScrollLeft,
    canScrollRight,
    handleScroll,
    updateScrollButtons,
  } = useCarouselLayout(episodes.length, {
    rows: ROWS,
    maxVisibleItems: 3,
    minVisibleItems: 2,
    minItemWidth: CAROUSEL_DEFAULTS.GRID_MIN_ITEM_WIDTH,
  })

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-hidden py-2">
        {Array.from({ length: visibleCount || 3 }).map((_, colIndex) => (
          <div
            key={colIndex}
            className="flex-shrink-0 flex flex-col gap-4 w-[var(--column-width)]"
            style={
              {
                '--column-width': `${CAROUSEL_DEFAULTS.GRID_MIN_ITEM_WIDTH}px`,
              } as React.CSSProperties
            }
          >
            {Array.from({ length: ROWS }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/30 animate-shimmer h-24">
                <div className="w-16 h-16 bg-muted rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const totalColumns = Math.ceil(episodes.length / ROWS)

  return (
    <div className="relative group/grid">
      <div
        ref={scrollRef}
        onScroll={updateScrollButtons}
        className="flex gap-4 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory"
      >
        {Array.from({ length: totalColumns }).map((_, colIndex) => (
          <div
            key={colIndex}
            className="flex-shrink-0 flex flex-col w-[var(--column-width)] snap-start"
          >
            <AnimatedList
              items={Array.from({ length: ROWS })
                .map((_, rowIndex) => episodes[colIndex * ROWS + rowIndex])
                .filter((ep): ep is NonNullable<typeof ep> => !!ep)}
              getKey={(episode) => episode.id}
              delay={colIndex * 0.1}
              staggerDelay={0.08}
              className="gap-4"
              renderItem={(episode, rowIndex) => {
                const podcastId = episode.url?.match(/\/id(\d+)/)?.[1]
                const episodeIndex = colIndex * ROWS + rowIndex

                return (
                  <div
                    className={cn(
                      'relative flex gap-0 py-3 px-0 h-24 w-full group/item transition-colors justify-start items-stretch text-start whitespace-normal overflow-hidden'
                    )}
                  >
                    {/* Artwork with Navigation & Play */}
                    <div className="relative flex-shrink-0 z-20">
                      <InteractiveArtwork
                        src={getDiscoveryArtworkUrl(episode.artworkUrl100, 200)}
                        to={podcastId ? '/podcast/$id/episode/$episodeId' : undefined}
                        params={
                          podcastId
                            ? {
                                id: podcastId,
                                episodeId: encodeURIComponent(episode.id),
                              }
                            : undefined
                        }
                        playIconSize={14}
                        hoverGroup="item"
                        size="md"
                        playLabel={t('ariaPlayEpisode')}
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col z-20 relative pt-1 ps-10">
                      {/* Rank: Absolutely centered in the 40px padding gutter */}
                      <span className="absolute start-0 top-1 w-10 text-sm font-medium text-foreground/70 tabular-nums leading-5 text-center pointer-events-none">
                        {episodeIndex + 1}
                      </span>

                      <InteractiveTitle
                        title={episode.name}
                        to={podcastId ? '/podcast/$id/episode/$episodeId' : undefined}
                        params={
                          podcastId
                            ? {
                                id: podcastId,
                                episodeId: encodeURIComponent(episode.id),
                              }
                            : undefined
                        }
                        className="text-sm font-medium leading-5"
                      />

                      {/* Row 2+: Metadata (Inherits ps-10 alignment) */}
                      <div className="pe-2 flex flex-col gap-0 mt-0">
                        <span className="text-xs text-foreground/70 truncate font-normal pointer-events-none">
                          {episode.artistName}
                        </span>

                        {episode.genres?.[0]?.name && (
                          <span className="text-xxs text-muted-foreground/60 uppercase tracking-wide mt-0 pointer-events-none">
                            {episode.genres[0].name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Separator: aligns from image left to content right */}
                    {rowIndex < ROWS - 1 && (
                      <div className="absolute bottom-0 start-0 end-0 h-px bg-border/70 z-40" />
                    )}
                  </div>
                )
              }}
            />
          </div>
        ))}
      </div>

      <CarouselNavigation
        canScrollLeft={canScrollLeft}
        canScrollRight={canScrollRight}
        onScroll={handleScroll}
        parentGroupName="grid"
        topClassName="top-1/2"
        heightClassName="h-20"
      />
    </div>
  )
}
