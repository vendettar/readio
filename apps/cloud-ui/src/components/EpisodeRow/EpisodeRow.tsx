import { useParams } from '@tanstack/react-router'
import { Play, Star } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useEpisodePlayback } from '../../hooks/useEpisodePlayback'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import type { Episode, Podcast } from '../../lib/discovery'
import { PLAYBACK_REQUEST_MODE } from '../../lib/player/playbackMode'
import { canPlayRemoteStreamWithoutTranscript } from '../../lib/player/remotePlayback'
import { normalizeCountryParam } from '../../lib/routes/podcastRoutes'
import { cn } from '../../lib/utils'
import { useExploreStore } from '../../store/exploreStore'
import { DropdownMenuItem } from '../ui/dropdown-menu'
import { ComponentErrorBoundary } from '../ui/error-boundary'
import { OverflowMenu } from '../ui/overflow-menu'
import { EpisodeListItem } from './EpisodeListItem'
import { fromEpisode } from './episodeRowModel'
import { useEpisodeRowFavoriteAction } from './useEpisodeRowFavoriteAction'

export interface EpisodeRowProps {
  episode: Episode
  podcast: Podcast
  podcastId?: string
  country?: string
  onPlay?: () => void
  showDescription?: boolean
  descriptionLines?: number
  showDivider?: boolean
  isLast?: boolean
  titleMaxLines?: number
  rank?: number
}

function EpisodeRowInner({
  episode,
  podcast,
  podcastId,
  country: manualCountry,
  onPlay: customOnPlay,
  showDescription = true,
  descriptionLines = 2,
  showDivider = true,
  isLast = false,
}: EpisodeRowProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  // Use atomic selectors to avoid subscribing to entire store
  const addFavorite = useExploreStore((s) => s.addFavorite)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)
  const globalCountry = useExploreStore((s) => s.country)
  const routeParams = useParams({ strict: false })
  const favorited = useExploreStore((s) =>
    s.isFavorited(
      podcast.feedUrl ?? '',
      episode.audioUrl ?? '',
      episode.id,
      episode.providerEpisodeId
    )
  )
  const { playEpisode } = useEpisodePlayback()
  const { isOnline } = useNetworkStatus()
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)

  // Use custom onPlay if provided, otherwise default to context playback
  const routeCountry =
    normalizeCountryParam(manualCountry) ??
    normalizeCountryParam((routeParams as { country?: string }).country) ??
    normalizeCountryParam(globalCountry)
  const handlePlay =
    customOnPlay || (() => playEpisode(episode, podcast, routeCountry ?? undefined))
  const canPlayWithoutTranscript = canPlayRemoteStreamWithoutTranscript(
    { audioUrl: episode.audioUrl },
    isOnline
  )
  const favoriteAction = useEpisodeRowFavoriteAction({
    favorited,
    favoriteKey: `${podcast.feedUrl ?? ''}::${episode.audioUrl ?? ''}`,
    addFavorite,
    removeFavorite,
    buildAddPayload: async () => ({
      podcast,
      episode,
      country: routeCountry,
    }),
    errorLogScope: 'EpisodeRow',
  })
  const model = fromEpisode({
    episode,
    podcast,
    podcastId,
    routeCountry,
    language,
    t,
  })
  const finalModel = showDescription ? model : { ...model, description: undefined }

  const actions = (
    <>
      <OverflowMenu
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        triggerAriaLabel={t('ariaMoreActions')}
        stopPropagation
        triggerClassName="w-8 h-8 rounded-full text-muted-foreground hover:text-primary hover:bg-accent transition-all relative ms-4"
        iconSize={15}
        contentClassName="w-max min-w-52 rounded-xl shadow-2xl border border-border/50 bg-popover/95 backdrop-blur-xl p-0"
      >
        {canPlayWithoutTranscript && (
          <DropdownMenuItem
            onSelect={() =>
              playEpisode(episode, podcast, routeCountry ?? undefined, {
                mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
              })
            }
            className="text-sm font-medium focus:bg-primary focus:text-primary-foreground whitespace-nowrap cursor-pointer justify-between"
          >
            <span>{t('playWithoutTranscript')}</span>
            <Play size={14} />
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => void favoriteAction.toggleFavorite()}
          className="text-sm font-medium focus:bg-primary focus:text-primary-foreground whitespace-nowrap cursor-pointer justify-between"
        >
          <span>{favoriteAction.favorited ? t('favoritesRemove') : t('favoritesAdd')}</span>
          <Star size={14} className={cn(favoriteAction.favorited && 'fill-current')} />
        </DropdownMenuItem>
      </OverflowMenu>
    </>
  )

  return (
    <EpisodeListItem
      model={finalModel}
      onPlay={handlePlay}
      favorite={{
        enabled: true,
        favorited: favoriteAction.favorited,
        isSaving: favoriteAction.isSaving,
        onToggle: favoriteAction.toggleFavorite,
      }}
      menu={actions}
      descriptionLines={descriptionLines}
      showDivider={showDivider}
      isLast={isLast}
    />
  )
}

export function EpisodeRow(props: EpisodeRowProps) {
  return (
    <ComponentErrorBoundary componentName="EpisodeRow" className="py-6 min-h-episode-row">
      <EpisodeRowInner {...props} />
    </ComponentErrorBoundary>
  )
}
