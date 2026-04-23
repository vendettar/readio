// src/components/Explore/PodcastEpisodesGrid.tsx

import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CAROUSEL_DEFAULTS } from '../../constants/layout'
import { useCarouselLayout } from '../../hooks/useCarouselLayout'
import type { TopEpisode } from '../../lib/discovery'
import { buildPodcastShowRoute, normalizeCountryParam } from '../../lib/routes/podcastRoutes'
import { cn } from '../../lib/utils'
import { useExploreStore } from '../../store/exploreStore'
import { AnimatedList } from '../bits/AnimatedList'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { CarouselShell } from './CarouselShell'

interface PodcastEpisodesGridProps {
  episodes: TopEpisode[]
  isLoading?: boolean
}

const ROWS = 3

export function PodcastEpisodesGrid({ episodes, isLoading }: PodcastEpisodesGridProps) {
  const { t } = useTranslation()
  const globalCountry = useExploreStore((s) => s.country)
  const navigate = useNavigate()
  const normalizedCountry = normalizeCountryParam(globalCountry)

  const {
    scrollRef,
    itemWidth,
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

  const totalColumns = isLoading ? visibleCount || 3 : Math.ceil(episodes.length / ROWS)

  async function handleOpenTopEpisode(episode: TopEpisode) {
    const podcastId = String(episode.podcastItunesId ?? '').trim()
    if (!podcastId || !normalizedCountry) return

    const showRoute = buildPodcastShowRoute({
      country: normalizedCountry,
      podcastId,
    })

    if (showRoute) {
      await navigate(showRoute)
    }
  }

  return (
    <CarouselShell
      scrollRef={scrollRef}
      onScrollUpdate={updateScrollButtons}
      cssVarName="--column-width"
      itemWidth={itemWidth}
      wrapperClassName="group/grid"
      viewportClassName={cn(
        'flex gap-4 scrollbar-none scroll-smooth snap-x snap-mandatory',
        isLoading ? 'overflow-hidden py-2' : 'overflow-x-auto'
      )}
      canScrollLeft={canScrollLeft}
      canScrollRight={canScrollRight}
      onNavigate={handleScroll}
      navParentGroupName="grid"
      navTopClassName="top-1/2"
      navHeightClassName="h-20"
    >
      {Array.from({ length: totalColumns }).map((_, colIndex) => (
        <div
          key={colIndex}
          className="flex-shrink-0 flex flex-col w-[var(--column-width)] snap-start"
        >
          {isLoading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: ROWS }).map((_, i) => (
                <div key={i} className="flex gap-0 py-2 px-0 h-22 w-full">
                  <div className="w-16 h-16 bg-muted rounded-lg flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <AnimatedList
              items={Array.from({ length: ROWS })
                .map((_, rowIndex) => episodes[colIndex * ROWS + rowIndex])
                .filter((ep): ep is NonNullable<typeof ep> => !!ep)}
              getKey={(episode) => `${episode.podcastItunesId}-${episode.title}`}
              delay={colIndex * 0.1}
              staggerDelay={0.08}
              renderItem={(episode, rowIndex) => {
                const episodeIndex = colIndex * ROWS + rowIndex

                return (
                  <div
                    key={`${episode.podcastItunesId}-${episode.title}`}
                    className={cn(
                      'relative flex gap-0 py-2 px-0 h-22 w-full group/item transition-colors justify-start items-stretch text-start whitespace-normal overflow-hidden'
                    )}
                  >
                    {/* Artwork with Navigation & Play */}
                    <div className="relative flex-shrink-0 flex items-center">
                      <InteractiveArtwork
                        src={episode.artwork}
                        onClick={() => {
                          void handleOpenTopEpisode(episode)
                        }}
                        playIconSize={16}
                        hoverGroup="episode"
                        size="md"
                        layoutId={`artwork-episode-${episode.podcastItunesId}-${episode.title}`}
                        playLabel={t('ariaPlayEpisode')}
                      />
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-start relative pt-1.5 ps-10">
                      {/* Rank: Absolutely positioned in the left gutter, aligned with title baseline */}
                      <span className="absolute start-0 top-1.5 w-10 text-sm font-medium text-foreground/70 tabular-nums leading-5 text-center pointer-events-none">
                        {episodeIndex + 1}
                      </span>

                      <InteractiveTitle
                        title={episode.title}
                        onClick={() => {
                          void handleOpenTopEpisode(episode)
                        }}
                        className="text-sm font-medium leading-5"
                      />

                      {/* Row 2+: Metadata (Inherits ps-10 alignment) */}
                      <div className="pe-2 flex flex-col gap-0 mt-0.5">
                        <span className="text-xs text-foreground/70 truncate font-normal pointer-events-none">
                          {episode.author}
                        </span>

                        {episode.genres?.[0] && (
                          <span className="text-xxs text-muted-foreground/60 uppercase tracking-wide mt-0 pointer-events-none">
                            {episode.genres[0]}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Separator: aligns from image left to content right */}
                    {rowIndex < ROWS - 1 && (
                      <div className="absolute bottom-0 start-0 end-0 h-px bg-border/70" />
                    )}
                  </div>
                )
              }}
            />
          )}
        </div>
      ))}
    </CarouselShell>
  )
}
