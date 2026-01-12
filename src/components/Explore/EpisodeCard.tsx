import { MoreHorizontal, Play, Star } from 'lucide-react'
import React from 'react'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatDuration, formatRelativeTime } from '../../libs/dateUtils'
import type { Episode, Podcast } from '../../libs/discoveryProvider'
import { stripHtml } from '../../libs/htmlUtils'
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

interface EpisodeCardProps {
  episode: Episode
  podcast: Podcast
  onPlay: () => void
}

export function EpisodeCard({ episode, podcast, onPlay }: EpisodeCardProps) {
  const { t } = useI18n()
  const { addFavorite, removeFavorite, isFavorited } = useExploreStore()
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)

  const favorited = isFavorited(podcast.feedUrl, episode.audioUrl)
  const encodedEpisodeId = encodeURIComponent(String(episode.id))

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (favorited) {
      removeFavorite(`${podcast.feedUrl}::${episode.audioUrl}`)
    } else {
      addFavorite(podcast, episode)
    }
  }

  const relativeTime = formatRelativeTime(episode.pubDate, t)
  const duration = formatDuration(episode.duration, t)
  const cleanDescription = stripHtml(episode.description || '')

  const hasEpisodeArtwork = !!episode.artworkUrl
  const artworkUrl = hasEpisodeArtwork ? episode.artworkUrl : undefined

  return (
    <div className="group/episode relative smart-divider-group pr-4">
      {/* Hover Background - Full area visual only */}
      <div className="absolute inset-y-0 -left-[var(--page-gutter-x)] right-0 rounded-lg bg-foreground/5 opacity-0 group-hover/episode:opacity-100 transition-opacity duration-300 pointer-events-none" />

      <div className="relative flex items-center gap-4 py-3">
        {/* Artwork with Navigation & Play */}
        {hasEpisodeArtwork && artworkUrl && (
          <div className="relative flex-shrink-0 z-20">
            <InteractiveArtwork
              src={artworkUrl}
              to="/podcast/$id/episode/$episodeId"
              params={{
                id: podcast.collectionId.toString(),
                episodeId: encodedEpisodeId,
              }}
              onPlay={onPlay}
              playButtonSize="sm"
              playIconSize={16}
              hoverGroup="episode"
              size="xl"
            />
          </div>
        )}

        <div className="flex-1 min-w-0 flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-12 py-1">
            {/* Date */}
            {relativeTime && (
              <div className="text-xxs text-muted-foreground font-medium mb-0.5 uppercase tracking-wider leading-tight">
                {relativeTime}
              </div>
            )}

            <div className="mb-0.5 z-20 relative">
              {!hasEpisodeArtwork && (
                <div className="absolute left-0 top-0 bottom-0 -translate-x-full w-[var(--page-gutter-x)] flex items-center justify-center opacity-0 group-hover/episode:opacity-100 transition-opacity duration-200 z-20 pointer-events-none">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlay()
                    }}
                    className="w-6 h-6 pointer-events-auto hover:bg-transparent"
                  >
                    <Play size={14} className="text-primary fill-current ml-0.5" />
                  </Button>
                </div>
              )}
              <InteractiveTitle
                title={episode.title}
                to="/podcast/$id/episode/$episodeId"
                params={{
                  id: podcast.collectionId.toString(),
                  episodeId: encodedEpisodeId,
                }}
                className="text-sm leading-tight"
              />
            </div>

            {/* Description */}
            {cleanDescription && (
              <p className="text-xs text-muted-foreground leading-snug line-clamp-3 font-light">
                {cleanDescription}
              </p>
            )}
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center flex-shrink-0 gap-12">
            {duration && (
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap w-20 text-left">
                {duration}
              </span>
            )}

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleToggleFavorite}
                className={cn(
                  'w-8 h-8 text-primary hover:bg-transparent hover:text-primary transition-opacity duration-200 relative z-20',
                  favorited || isMenuOpen
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/episode:opacity-100'
                )}
                aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
              >
                <Star size={15} className={cn('stroke-2', favorited && 'fill-current')} />
              </Button>

              <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      'w-8 h-8 text-primary hover:bg-transparent hover:opacity-80 transition-opacity duration-200 relative z-20',
                      isMenuOpen && 'text-primary opacity-100' // Keeping it highlighted or visible
                    )}
                    aria-label={t('ariaMoreActions')}
                  >
                    <MoreHorizontal size={15} />
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
                    onSelect={() => {
                      if (favorited) {
                        removeFavorite(`${podcast.feedUrl}::${episode.audioUrl}`)
                      } else {
                        addFavorite(podcast, episode)
                      }
                    }}
                    className="text-sm font-medium focus:bg-primary focus:text-primary-foreground"
                  >
                    <Star size={14} className={cn('mr-2', favorited && 'fill-current')} />
                    {favorited ? t('favoritesRemove') : t('favoritesAdd')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      {/* Separator */}
      <div className="absolute bottom-0 left-0 right-4 h-px bg-border group-hover/episode:opacity-0 transition-opacity smart-divider group-last/episode:hidden" />
    </div>
  )
}
