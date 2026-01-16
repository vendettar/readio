import { MoreHorizontal, Star } from 'lucide-react'
import React from 'react'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatDuration, formatRelativeTime } from '../../lib/dateUtils'
import discovery, { type Episode, type Podcast, type SearchEpisode } from '../../lib/discovery'
import { stripHtml } from '../../lib/htmlUtils'
import { toast } from '../../lib/toast'
import { useExploreStore } from '../../store/exploreStore'
import { BaseEpisodeRow, GutterPlayButton } from '../EpisodeRow'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

interface SearchEpisodeItemProps {
  episode: SearchEpisode
  onPlay: () => void
}

export function SearchEpisodeItem({ episode, onPlay }: SearchEpisodeItemProps) {
  const { t } = useI18n()
  const { favorites, addFavorite, removeFavorite } = useExploreStore()

  const [isSaving, setIsSaving] = React.useState(false)
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const rawEpisodeId = episode.episodeGuid || episode.providerEpisodeId.toString()
  const encodedEpisodeId = encodeURIComponent(rawEpisodeId)
  const podcastId = episode.providerPodcastId?.toString()

  // SearchEpisode might not have feedUrl, so we check favorites by audioUrl
  const favoritedItem = favorites.find((f) => f.audioUrl === episode.episodeUrl)
  const favorited = !!favoritedItem

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (favorited) {
      removeFavorite(favoritedItem.key)
    } else {
      setIsSaving(true)
      try {
        // Optimization: Feed URL is now available in SearchEpisode (entity=podcastEpisode)!
        let podcast: Podcast | null = null
        if (episode.feedUrl) {
          podcast = {
            providerPodcastId: episode.providerPodcastId,
            collectionName: episode.collectionName,
            artistName: episode.artistName,
            artworkUrl100: episode.artworkUrl100,
            artworkUrl600: episode.artworkUrl600,
            feedUrl: episode.feedUrl,
            collectionViewUrl: '',
            genres: [],
          }
        } else {
          const fullPodcast = await discovery.getPodcast(episode.providerPodcastId.toString())
          podcast = fullPodcast
        }

        if (!podcast) throw new Error('Podcast not found')

        // Construct Episode object from SearchEpisode metadata
        const episodeObj: Episode = {
          id: episode.episodeGuid ?? episode.providerEpisodeId.toString(),
          title: episode.trackName,
          description: episode.description || '',
          audioUrl: episode.episodeUrl,
          pubDate: episode.releaseDate || '',
          artworkUrl: episode.artworkUrl600 || episode.artworkUrl100,
          duration: (episode.trackTimeMillis || 0) / 1000,
        }

        await addFavorite(podcast, episodeObj)
      } catch (err) {
        console.error('[SearchEpisodeItem] Failed to favorite:', err)
        toast.errorKey('toastAddFavoriteFailed')
      } finally {
        setIsSaving(false)
      }
    }
  }

  const relativeTime = formatRelativeTime(episode.releaseDate || '', t)
  const duration = formatDuration((episode.trackTimeMillis || 0) / 1000, t)
  const cleanDescription = stripHtml(episode.description || '')
  const artworkUrl = episode.artworkUrl600 || episode.artworkUrl100
  // Since SearchEpisode metadata often blends podcast/episode info, we use the same as fallback
  // if it's already the primary, InteractiveArtwork handles it.
  const podcastArtwork = episode.artworkUrl600 || episode.artworkUrl100

  const hasArtwork = !!(episode.artworkUrl600 || episode.artworkUrl100)

  return (
    <BaseEpisodeRow
      artwork={
        hasArtwork ? (
          <InteractiveArtwork
            src={artworkUrl}
            fallbackSrc={podcastArtwork}
            to={podcastId ? '/podcast/$id/episode/$episodeId' : undefined}
            params={
              podcastId
                ? {
                    id: podcastId,
                    episodeId: encodedEpisodeId,
                  }
                : undefined
            }
            onPlay={onPlay}
            playButtonSize="md"
            playIconSize={20}
            hoverGroup="episode"
            size="xl"
          />
        ) : undefined
      }
      title={
        <div className="flex items-center">
          {!hasArtwork && <GutterPlayButton onPlay={onPlay} ariaLabel={t('ariaPlayEpisode')} />}
          <InteractiveTitle
            title={episode.trackName}
            to={podcastId ? '/podcast/$id/episode/$episodeId' : undefined}
            params={
              podcastId
                ? {
                    id: podcastId,
                    episodeId: encodedEpisodeId,
                  }
                : undefined
            }
            className="text-sm leading-tight flex-1"
          />
        </div>
      }
      subtitle={
        <div className="flex items-center gap-1">
          {relativeTime && <span>{relativeTime}</span>}
          {relativeTime && episode.collectionName && <span>•</span>}
          {episode.collectionName && <span className="line-clamp-1">{episode.collectionName}</span>}
        </div>
      }
      description={cleanDescription}
      meta={duration}
      actions={
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleFavorite}
            className={cn(
              'w-9 h-9 text-primary hover:bg-transparent hover:text-primary transition-opacity duration-200 relative z-20'
            )}
            aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
          >
            <Star
              size={16}
              className={cn(
                'stroke-2',
                favorited && 'fill-current',
                isSaving && 'animate-pulse opacity-50'
              )}
            />
          </Button>

          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'w-9 h-9 text-primary hover:bg-transparent hover:opacity-80 transition-opacity duration-200 relative z-20',
                  isMenuOpen && 'opacity-100'
                )}
                aria-label={t('ariaMoreActions')}
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
                onSelect={(e) => {
                  handleToggleFavorite(e as unknown as React.MouseEvent)
                }}
                className="text-sm font-medium focus:bg-primary focus:text-primary-foreground"
              >
                <Star
                  size={14}
                  className={cn(
                    'mr-2',
                    favorited && 'fill-current',
                    isSaving && 'animate-pulse opacity-50'
                  )}
                />
                {favorited ? t('favoritesRemove') : t('favoritesAdd')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      descriptionLines={3}
    />
  )
}
