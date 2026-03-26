import { Play, Star } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import discovery, { type Episode, type Podcast, type SearchEpisode } from '../../lib/discovery'
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

  // SearchEpisode might not have feedUrl, so we check favorites by audioUrl
  const favoritedItem = favorites.find((f) => f.audioUrl === episode.episodeUrl)
  const favorited = !!favoritedItem

  const favoriteAction = useEpisodeRowFavoriteAction({
    favorited,
    favoriteKey: favoritedItem?.key ?? null,
    addFavorite,
    removeFavorite,
    buildAddPayload: async () => {
      // Keep search fallback contract: feedUrl first, then provider lookup.
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
        const providerPodcastId = episode.providerPodcastId
        if (!providerPodcastId) {
          throw new Error('Missing providerPodcastId for metadata lookup')
        }
        podcast = await discovery.getPodcast(String(providerPodcastId), globalCountry ?? 'us')
      }
      if (!podcast) throw new Error('Podcast not found')

      const episodeObj: Episode = {
        id: episode.episodeGuid ?? episode.providerEpisodeId?.toString() ?? episode.episodeUrl,
        title: episode.trackName,
        description: episode.description || '',
        audioUrl: episode.episodeUrl,
        pubDate: episode.releaseDate || '',
        artworkUrl: episode.artworkUrl600 || episode.artworkUrl100,
        duration: (episode.trackTimeMillis || 0) / 1000,
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
