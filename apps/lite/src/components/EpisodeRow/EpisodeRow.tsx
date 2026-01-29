import { Star } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useEpisodePlayback } from '../../hooks/useEpisodePlayback'
import { formatDuration, formatRelativeTime } from '../../lib/dateUtils'
import type { Episode, Podcast } from '../../lib/discovery'
import { stripHtml } from '../../lib/htmlUtils'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { cn } from '../../lib/utils'
import { useExploreStore } from '../../store/exploreStore'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { Button } from '../ui/button'
import { DropdownMenuItem } from '../ui/dropdown-menu'
import { OverflowMenu } from '../ui/overflow-menu'
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
  const { t } = useTranslation()
  const { addFavorite, removeFavorite, isFavorited } = useExploreStore()
  const { playEpisode } = useEpisodePlayback()
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)

  const favorited = isFavorited(
    podcast.feedUrl ?? '',
    episode.audioUrl ?? '',
    episode.id,
    episode.providerEpisodeId
  )
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
          'w-8 h-8 text-primary hover:bg-transparent hover:text-primary transition-opacity duration-200 relative z-20',
          !favorited && 'opacity-0 group-hover/episode:opacity-100' // Only show on hover if not favorited
        )}
        aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
      >
        <Star size={15} className={cn('stroke-2', favorited && 'fill-current')} />
      </Button>

      <OverflowMenu
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        triggerAriaLabel={t('ariaMoreActions')}
        stopPropagation
        triggerClassName="w-8 h-8 rounded-full text-muted-foreground hover:text-primary hover:bg-accent transition-all relative z-20"
        iconSize={15}
        contentClassName="min-w-44 rounded-xl shadow-2xl border border-border/50 bg-popover/95 backdrop-blur-xl p-0"
      >
        <DropdownMenuItem
          onSelect={() => {
            if (favorited) {
              removeFavorite(`${podcast.feedUrl ?? ''}::${episode.audioUrl ?? ''}`)
            } else {
              addFavorite(podcast, episode)
            }
          }}
          className="text-sm font-medium focus:bg-primary focus:text-primary-foreground whitespace-nowrap cursor-pointer"
        >
          <Star size={14} className={cn('me-2', favorited && 'fill-current')} />
          {favorited ? t('favoritesRemove') : t('favoritesAdd')}
        </DropdownMenuItem>
      </OverflowMenu>
    </>
  )

  // Use episode artwork if available; otherwise show nothing (BaseEpisodeRow handles no-artwork layout)
  const effectiveArtwork = episode.artworkUrl
  const hasArtwork = !!effectiveArtwork

  // Validate podcast ID for navigation - only navigate if we have a valid ID
  const podcastId = String(podcast.providerPodcastId ?? '')
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
            playIconSize={16}
            hoverGroup="episode"
            size="xl"
            playLabel={t('ariaPlayEpisode')}
          />
        ) : undefined
      }
      title={
        <div className="relative">
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
