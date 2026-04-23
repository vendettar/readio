import { Star } from 'lucide-react'
import type React from 'react'
import { memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useEpisodeStatus } from '@/hooks/useEpisodeStatus'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { Button } from '../ui/button'
import { BaseEpisodeRow } from './BaseEpisodeRow'
import { DownloadEpisodeButton } from './DownloadEpisodeButton'
import type { EpisodeRowModel } from './episodeRowModel'
import { GutterPlayButton } from './GutterPlayButton'

interface EpisodeListItemProps {
  model: EpisodeRowModel
  onPlay: () => void
  favorite?: {
    enabled: boolean
    favorited: boolean
    isSaving?: boolean
    onToggle: () => void
  }
  menu?: React.ReactNode
  bottomMeta?: React.ReactNode
  descriptionLines?: number
  showDivider?: boolean
  isLast?: boolean
}

function EpisodeListItemImpl({
  model,
  onPlay,
  favorite,
  menu,
  bottomMeta,
  descriptionLines = 2,
  showDivider = true,
  isLast = false,
}: EpisodeListItemProps) {
  const { t } = useTranslation()

  const showFavorite = !!favorite?.enabled
  const hasArtwork = !!(model.artworkBlob || model.artworkSrc)

  const status = useEpisodeStatus(model.downloadArgs?.audioUrl)

  const handlePlay = useCallback(() => {
    if (!status.playable) {
      if (status.disabledReason === 'offline_remote_only') {
        toast.error(t('offlineRemoteOnlyDisabled'))
      }
      return
    }
    onPlay()
  }, [status.playable, status.disabledReason, onPlay, t])

  return (
    <BaseEpisodeRow
      isLast={isLast}
      showDivider={showDivider}
      descriptionLines={descriptionLines}
      subtitle={model.subtitle}
      description={model.description}
      meta={model.meta}
      bottomMeta={bottomMeta}
      artwork={
        hasArtwork ? (
          <InteractiveArtwork
            src={model.artworkSrc}
            fallbackSrc={model.artworkFallbackSrc}
            blob={model.artworkBlob}
            to={model.route?.to}
            params={model.route?.params}
            search={model.route?.search}
            state={model.route?.state}
            onPlay={handlePlay}
            playLabel={model.playAriaLabel}
            playIconSize={model.playIconSize}
            hoverGroup="episode"
            size={model.artworkSize || 'md'}
          />
        ) : undefined
      }
      title={
        <div className="flex items-center">
          {!hasArtwork && <GutterPlayButton onPlay={handlePlay} ariaLabel={model.playAriaLabel} />}
          <InteractiveTitle
            title={model.title}
            to={model.route?.to}
            params={model.route?.params}
            search={model.route?.search}
            state={model.route?.state}
            className="text-sm leading-tight flex-1"
            maxLines={1}
          />
        </div>
      }
      actions={
        <>
          {showFavorite ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                void favorite.onToggle()
              }}
              className={cn(
                'w-8 h-8 text-primary hover:bg-transparent hover:text-primary transition-opacity duration-200',
                !favorite.favorited &&
                  'opacity-0 group-hover/episode:opacity-100 focus-visible:opacity-100 group-focus-within/episode:opacity-100'
              )}
              aria-label={favorite.favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
            >
              <Star
                size={15}
                className={cn(
                  'stroke-2',
                  favorite.favorited && 'fill-current',
                  favorite.isSaving && 'animate-pulse opacity-50'
                )}
              />
            </Button>
          ) : null}
          {model.downloadArgs ? (
            <DownloadEpisodeButton
              episodeTitle={model.downloadArgs.episodeTitle}
              episodeDescription={model.description}
              showTitle={model.downloadArgs.podcastTitle}
              feedUrl={model.downloadArgs.feedUrl}
              audioUrl={model.downloadArgs.audioUrl}
              transcriptUrl={model.downloadArgs.transcriptUrl}
              artworkUrl={model.downloadArgs.artworkUrl}
              countryAtSave={model.downloadArgs.countryAtSave}
              podcastItunesId={model.downloadArgs.podcastItunesId}
              episodeGuid={model.downloadArgs.episodeGuid}
              durationSeconds={model.downloadArgs.durationSeconds}
              episodeStatus={status}
            />
          ) : null}
          {menu}
        </>
      }
    />
  )
}

export const EpisodeListItem = memo(EpisodeListItemImpl)
EpisodeListItem.displayName = 'EpisodeListItem'
