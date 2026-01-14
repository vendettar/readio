import { MoreHorizontal, Star } from 'lucide-react'
import React from 'react'
import { useEpisodePlayback } from '../../hooks/useEpisodePlayback'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatDuration, formatRelativeTime } from '../../libs/dateUtils'
import type { Episode, Podcast } from '../../libs/discovery'
import { stripHtml } from '../../libs/htmlUtils'
import { getDiscoveryArtworkUrl } from '../../libs/imageUtils'
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
import { BaseEpisodeRow } from './BaseEpisodeRow'
import { GutterPlayButton } from './GutterPlayButton'

export interface EpisodeRowProps {
  episode: Episode
  podcast: Podcast
  onPlay?: () => void
  showDescription?: boolean
  descriptionLines?: number
  showDivider?: boolean
  isLast?: boolean
  titleMaxLines?: number
  rank?: number
}

export function EpisodeRow({
  episode,
  podcast,
  onPlay: customOnPlay,
  showDescription = true,
  descriptionLines = 2,
  showDivider = true,
  isLast = false,
  titleMaxLines = 2,
}: EpisodeRowProps) {
  const { t } = useI18n()
  const { addFavorite, removeFavorite, isFavorited } = useExploreStore()
  const { playEpisode } = useEpisodePlayback()
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)

  const favorited = isFavorited(podcast.feedUrl ?? '', episode.audioUrl ?? '')
  const encodedEpisodeId = encodeURIComponent(String(episode.id))

  // Use custom onPlay if provided, otherwise default to context playback
  const handlePlay = customOnPlay || (() => playEpisode(episode, podcast))

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (favorited) {
      removeFavorite(`${podcast.feedUrl ?? ''}::${episode.audioUrl ?? ''}`)
    } else {
      addFavorite(podcast, episode)
    }
  }

  const relativeTime = formatRelativeTime(episode.pubDate, t)
  const duration = formatDuration(episode.duration, t)
  const cleanDescription = showDescription ? stripHtml(episode.description || '') : undefined

  // Podcast artwork for fallback
  const podcastArtwork = podcast.artworkUrl600 || podcast.artworkUrl100

  // Construct subtitle (Rank + Date)
  // If rank is present, it might go before title or in subtitle.
  // The user requirement said: "If ranked styles are needed, a new RankedEpisodeRow should be created".
  // But for now we just standardizing generic rows.
  // Let's use relativeTime as the subtitle to match EpisodeCard's layout.

  const actions = (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggleFavorite}
        className={cn(
          'w-8 h-8 text-primary hover:bg-transparent hover:text-primary transition-opacity duration-200 relative z-20'
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
            onClick={(e) => e.stopPropagation()}
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
                removeFavorite(`${podcast.feedUrl ?? ''}::${episode.audioUrl ?? ''}`)
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
    </>
  )

  // Use episode artwork if available; otherwise show nothing (BaseEpisodeRow handles no-artwork layout)
  const effectiveArtwork = episode.artworkUrl
  const hasArtwork = !!effectiveArtwork

  // Validate podcast ID for navigation - only navigate if we have a valid ID
  const podcastId = String(podcast.providerPodcastId ?? podcast.collectionId ?? '')
  const hasValidNavigation = podcastId.length > 0

  return (
    <BaseEpisodeRow
      artwork={
        hasArtwork ? (
          <InteractiveArtwork
            src={getDiscoveryArtworkUrl(effectiveArtwork, 200)}
            fallbackSrc={podcastArtwork}
            to={hasValidNavigation ? '/podcast/$id/episode/$episodeId' : undefined}
            params={
              hasValidNavigation
                ? {
                    id: podcastId,
                    episodeId: encodedEpisodeId,
                  }
                : undefined
            }
            onPlay={handlePlay}
            playButtonSize="sm"
            playIconSize={16}
            hoverGroup="episode"
            size="xl"
            playLabel={t('ariaPlayEpisode')}
          />
        ) : undefined
      }
      title={
        <div className="flex items-center">
          {!hasArtwork && <GutterPlayButton onPlay={handlePlay} ariaLabel={t('ariaPlayEpisode')} />}
          <InteractiveTitle
            title={episode.title}
            to={hasValidNavigation ? '/podcast/$id/episode/$episodeId' : undefined}
            params={
              hasValidNavigation
                ? {
                    id: podcastId,
                    episodeId: encodedEpisodeId,
                  }
                : undefined
            }
            className="text-sm leading-tight flex-1"
            maxLines={titleMaxLines as 1 | 2}
          />
        </div>
      }
      subtitle={relativeTime} // Using relativeTime as subtitle (top-aligned date)
      description={cleanDescription}
      meta={duration}
      actions={actions}
      descriptionLines={descriptionLines}
      showDivider={showDivider}
      isLast={isLast}
    />
  )
}
