import { useQueryClient } from '@tanstack/react-query'
import { Play, Star } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import type { FavoriteEpisodeInput, SearchEpisode } from '../../lib/discovery'
import { ensurePodcastDetail } from '../../lib/discovery/queryCache'
import { canPlayRemoteStreamWithoutTranscript } from '../../lib/player/remotePlayback'
import { normalizeCountryParam } from '../../lib/routes/podcastRoutes'
import { cn } from '../../lib/utils'
import { useExploreStore } from '../../store/exploreStore'
import { EpisodeListItem } from '../EpisodeRow'
import { fromSearchEpisode } from '../EpisodeRow/episodeRowModel'
import { useEpisodeRowFavoriteAction } from '../EpisodeRow/useEpisodeRowFavoriteAction'
import { DropdownMenuItem } from '../ui/dropdown-menu'
import { OverflowMenu } from '../ui/overflow-menu'

interface SearchEpisodeItemProps {
  episode: SearchEpisode
  onPlay: () => void
  onPlayWithoutTranscript?: () => void
}

export function SearchEpisodeItem({
  episode,
  onPlay,
  onPlayWithoutTranscript,
}: SearchEpisodeItemProps) {
  const queryClient = useQueryClient()
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const { isOnline } = useNetworkStatus()
  // Use atomic selectors to avoid subscribing to entire store
  const favorites = useExploreStore((s) => s.favorites)
  const addFavorite = useExploreStore((s) => s.addFavorite)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)
  const globalCountry = normalizeCountryParam(useExploreStore((s) => s.country))

  const [isMenuOpen, setIsMenuOpen] = React.useState(false)
  const canPlayWithoutTranscript =
    !!onPlayWithoutTranscript &&
    canPlayRemoteStreamWithoutTranscript({ audioUrl: episode.episodeUrl }, isOnline)

  const favoritedItem = favorites.find((f) => f.audioUrl === episode.episodeUrl)
  const favorited = !!favoritedItem

  const favoriteAction = useEpisodeRowFavoriteAction({
    favorited,
    favoriteKey: favoritedItem?.key ?? null,
    addFavorite,
    removeFavorite,
    buildAddPayload: async () => {
      const podcastItunesId = episode.podcastItunesId
      if (!podcastItunesId) {
        throw new Error('Missing podcastItunesId for metadata lookup')
      }
      const podcast = await ensurePodcastDetail(queryClient, String(podcastItunesId), globalCountry)
      if (!podcast) throw new Error('Podcast not found')

      const episodeObj: FavoriteEpisodeInput = {
        title: episode.title || '',
        description: episode.shortDescription || '',
        audioUrl: episode.episodeUrl,
        pubDate: '',
        artworkUrl: episode.artwork,
        duration: (episode.trackTimeMillis || 0) / 1000,
        episodeGuid: episode.episodeGuid,
      }
      return { podcast, episode: episodeObj }
    },
    errorLogScope: 'SearchEpisodeItem',
  })
  const model = fromSearchEpisode({ episode, routeCountry: globalCountry, language, t })

  return (
    <EpisodeListItem
      model={model}
      onPlay={onPlay}
      favorite={{
        enabled: true,
        favorited: favoriteAction.favorited,
        isSaving: favoriteAction.isSaving,
        onToggle: favoriteAction.toggleFavorite,
      }}
      menu={
        <OverflowMenu
          open={isMenuOpen}
          onOpenChange={setIsMenuOpen}
          triggerAriaLabel={t('ariaMoreActions')}
          stopPropagation
          triggerClassName="w-9 h-9 rounded-full text-muted-foreground hover:text-primary hover:bg-accent transition-all relative ms-4"
          iconSize={16}
          contentClassName="w-max min-w-52 rounded-xl shadow-2xl border border-border/50 bg-popover/95 backdrop-blur-xl p-0"
        >
          {canPlayWithoutTranscript && (
            <DropdownMenuItem
              onSelect={onPlayWithoutTranscript}
              className="text-sm font-medium focus:bg-primary focus:text-primary-foreground whitespace-nowrap cursor-pointer justify-between"
            >
              <span>{t('playWithoutTranscript')}</span>
              <Play size={14} />
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              void favoriteAction.toggleFavorite()
            }}
            className="text-sm font-medium focus:bg-primary focus:text-primary-foreground whitespace-nowrap cursor-pointer justify-between"
          >
            <span>{favoriteAction.favorited ? t('favoritesRemove') : t('favoritesAdd')}</span>
            <Star
              size={14}
              className={cn(
                favoriteAction.favorited && 'fill-current',
                favoriteAction.isSaving && 'animate-pulse opacity-50'
              )}
            />
          </DropdownMenuItem>
        </OverflowMenu>
      }
      descriptionLines={3}
    />
  )
}
