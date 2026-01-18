// src/components/Explore/PodcastEpisodesGrid.tsx

import { Link } from '@tanstack/react-router'
import { Info, Link as LinkIcon, MoreHorizontal, Play, RadioTower, Star } from 'lucide-react'
import React from 'react'
import { CAROUSEL_DEFAULTS } from '../../constants/layout'
import { useCarouselLayout } from '../../hooks/useCarouselLayout'
import { useI18n } from '../../hooks/useI18n'
import type { DiscoveryPodcast } from '../../lib/discovery'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { cn } from '../../lib/utils'
import { useExploreStore } from '../../store/exploreStore'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { CarouselNavigation } from './CarouselNavigation'

interface PodcastEpisodesGridProps {
  episodes: DiscoveryPodcast[]
  onPlay?: (episode: DiscoveryPodcast) => void
  onFavorite?: (episode: DiscoveryPodcast) => Promise<void> | void
  isLoading?: boolean
}

const ROWS = 3

export function PodcastEpisodesGrid({
  episodes,
  onPlay,
  onFavorite,
  isLoading,
}: PodcastEpisodesGridProps) {
  const { t } = useI18n()
  const favorites = useExploreStore((s) => s.favorites)
  const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)
  const [processingId, setProcessingId] = React.useState<string | null>(null)
  const menuItemClassName = 'text-sm font-medium focus:bg-primary focus:text-primary-foreground'
  const favoritedIds = React.useMemo(
    () => new Set(favorites.map((f) => f.episodeId).filter(Boolean) as string[]),
    [favorites]
  )

  const favoriteAudioUrls = React.useMemo(
    () => new Set(favorites.map((favorite) => favorite.audioUrl).filter(Boolean) as string[]),
    [favorites]
  )

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
            className="flex-shrink-0 flex flex-col gap-4 w-[var(--column-width)] snap-start"
          >
            {Array.from({ length: ROWS }).map((_, rowIndex) => {
              const episodeIndex = colIndex * ROWS + rowIndex
              const episode = episodes[episodeIndex]
              if (!episode) return null

              const favorited =
                favoritedIds.has(episode.id) ||
                (episode.url ? favoriteAudioUrls.has(episode.url) : false)
              const podcastId = episode.url?.match(/\/id(\d+)/)?.[1]

              return (
                <div
                  key={episode.id}
                  className={cn(
                    'relative flex gap-0 py-3 px-0 h-24 w-full group/item transition-colors justify-start items-stretch text-left whitespace-normal overflow-hidden'
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
                      onPlay={() => onPlay?.(episode)}
                      playButtonSize="sm"
                      playIconSize={14}
                      hoverGroup="item"
                      size="md"
                      className="rounded-md"
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col z-20 relative pt-1 pl-10">
                    {/* Rank: Absolutely centered in the 40px padding gutter */}
                    <span className="absolute left-0 top-1 w-10 text-sm font-medium text-foreground/70 tabular-nums leading-5 text-center pointer-events-none">
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

                    {/* Row 2+: Metadata (Inherits pl-10 alignment) */}
                    <div className="pr-2 flex flex-col gap-0 mt-0">
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

                  {/* Separator: aligns from image left to content right (last dot) */}
                  {rowIndex < ROWS - 1 && (
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-border/70 z-40" />
                  )}

                  {/* Hover actions with fade effect */}
                  <div
                    className={cn(
                      'absolute right-0 inset-y-0 flex transition-opacity duration-200 z-30',
                      openMenuId === episode.id
                        ? 'opacity-100'
                        : 'opacity-0 group-hover/item:opacity-100'
                    )}
                  >
                    {/* Gradient fade */}
                    <div className="w-12 bg-gradient-to-r from-transparent to-background" />
                    {/* Solid background covering all text to the right */}
                    <div className="bg-background flex items-center gap-1 pr-2 pl-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async (e) => {
                          e.stopPropagation()
                          setProcessingId(episode.id)
                          try {
                            await onFavorite?.(episode)
                          } finally {
                            setProcessingId(null)
                          }
                        }}
                        className={cn(
                          'w-8 h-8 transition-colors hover:bg-transparent',
                          favorited ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                        )}
                      >
                        <Star
                          size={16}
                          className={cn(
                            'stroke-2',
                            favorited && 'fill-current',
                            processingId === episode.id && 'animate-pulse opacity-50'
                          )}
                        />
                      </Button>

                      <DropdownMenu
                        open={openMenuId === episode.id}
                        onOpenChange={(open) => setOpenMenuId(open ? episode.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              'w-8 h-8 text-muted-foreground hover:text-primary transition-colors hover:bg-transparent',
                              openMenuId === episode.id && 'text-primary opacity-100'
                            )}
                          >
                            <MoreHorizontal size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={8}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-xl shadow-2xl border border-border/50 bg-popover/95 backdrop-blur-xl p-0 overflow-hidden"
                        >
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              onPlay?.(episode)
                            }}
                            className={menuItemClassName}
                          >
                            <Play size={14} className="mr-2 fill-current" />
                            {t('playerPlay')}
                          </DropdownMenuItem>
                          {podcastId && (
                            <DropdownMenuItem asChild className={menuItemClassName}>
                              <Link
                                to="/podcast/$id/episode/$episodeId"
                                params={{
                                  id: podcastId,
                                  episodeId: encodeURIComponent(episode.id),
                                }}
                              >
                                <Info size={14} className="mr-2" />
                                {t('details')}
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {podcastId && (
                            <DropdownMenuItem asChild className={menuItemClassName}>
                              <Link
                                to="/podcast/$id"
                                params={{
                                  id: podcastId,
                                }}
                              >
                                <RadioTower size={14} className="mr-2" />
                                {t('podcastLabel')}
                              </Link>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              if (episode.url) navigator.clipboard.writeText(episode.url)
                            }}
                            className={menuItemClassName}
                          >
                            <LinkIcon size={14} className="mr-2" />
                            {t('copyLink')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              )
            })}
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
