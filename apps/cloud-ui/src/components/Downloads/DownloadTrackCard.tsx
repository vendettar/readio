import { cva } from 'class-variance-authority'
import {
  Clock,
  FileAudio,
  Package,
  Star,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateStandard, formatDuration } from '../../lib/dateUtils'
import type { FileSubtitle, PodcastDownload } from '../../lib/db/types'
import { formatFileSize } from '../../lib/formatters'
import { stripHtml } from '../../lib/htmlUtils'
import type { SubtitleExportFormat } from '../../lib/subtitles'
import { cn } from '../../lib/utils'
import type { ViewDensity } from '../Files/types'
import { InteractiveArtwork } from '../interactive/InteractiveArtwork'
import { InteractiveTitle } from '../interactive/InteractiveTitle'
import { Button } from '../ui/button'
import { DownloadSubtitleList } from './DownloadSubtitleList'
import { DownloadTrackOverflowMenu } from './DownloadTrackOverflowMenu'

const trackCardContentVariants = cva('flex items-center bg-card transition-colors', {
  variants: {
    density: {
      comfortable: 'px-4 py-3 gap-4',
      compact: 'px-3 py-2 gap-3',
    },
  },
  defaultVariants: {
    density: 'comfortable',
  },
})

const trackCardIconVariants = cva(
  'flex items-center justify-center flex-none text-muted-foreground',
  {
    variants: {
      density: {
        comfortable: 'w-16 h-16',
        compact: 'w-12 h-12',
      },
      hasArtwork: {
        true: 'shadow-none bg-transparent rounded-lg overflow-hidden',
        false: 'bg-muted shadow-inner rounded-lg overflow-hidden',
      },
    },
    defaultVariants: {
      density: 'comfortable',
      hasArtwork: false,
    },
  }
)

const DOWNLOAD_ARTWORK_PLAY_ICON_SIZE = {
  compact: 16,
  comfortable: 20,
} as const

const DOWNLOAD_ARTWORK_PLAY_BUTTON_SCALE = {
  compact: 'xxl',
  comfortable: 'l',
} as const

const DOWNLOAD_FALLBACK_ARTWORK_ICON_SIZE = {
  compact: 20,
  comfortable: 24,
} as const

const DOWNLOAD_META_ICON_SIZE = 16

const DOWNLOAD_METADATA_SEPARATOR = ' • '

interface DownloadTrackCardProps {
  track: PodcastDownload
  artworkBlob: Blob | null
  subtitles: FileSubtitle[]
  density?: ViewDensity
  favorite?: {
    enabled: boolean
    favorited: boolean
    isSaving?: boolean
    onToggle: () => void
  }
  onPlay: (overrideSubtitleId?: string) => void
  onPlayWithoutTranscript?: () => void
  showPlayWithoutTranscriptAction?: boolean
  onRemove: () => Promise<boolean> | boolean
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => void
  onDeleteSubtitle: (trackId: string, fileSubtitleId: string) => Promise<boolean> | boolean
  onExportSubtitle: (trackId: string, fileSubtitleId: string, format: SubtitleExportFormat) => void
  onExportAudio?: () => void
  onImportSubtitle?: () => void
  onRetranscribe?: () => void
  episodeRoute?: {
    to: string
    params: Record<string, string>
  } | null
}

export function DownloadTrackCard({
  track,
  artworkBlob,
  subtitles,
  density = 'comfortable',
  favorite,
  onPlay,
  onPlayWithoutTranscript,
  showPlayWithoutTranscriptAction = false,
  onRemove,
  onSetActiveSubtitle,
  onDeleteSubtitle,
  onExportSubtitle,
  onExportAudio,
  onImportSubtitle,
  onRetranscribe,
  episodeRoute,
}: DownloadTrackCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [_renderTick] = useState(0)

  const sizeLabel = formatFileSize(track.sizeBytes ?? 0, language)
  const durationLabel = track.durationSeconds ? formatDuration(track.durationSeconds, t) : ''

  const hasArtwork = artworkBlob != null || Boolean(track.sourceArtworkUrl?.trim())

  const title = track.sourceEpisodeTitle || track.name
  const subtitleRowTitle = title.trim()
  const formattedDate = track.downloadedAt ? formatDateStandard(track.downloadedAt, language) : ''
  const subtitle = [track.sourcePodcastTitle, formattedDate]
    .filter(Boolean)
    .join(DOWNLOAD_METADATA_SEPARATOR)
  const description = stripHtml(track.sourceDescription || '')

  const isCompact = density === 'compact'
  const hasAudioExportAction = Boolean(onExportAudio)

  return (
    <div className="track-card border rounded-xl bg-card shadow-sm overflow-hidden transition-shadow relative select-none cursor-default border-border hover:shadow-md group/episode">
      <div className={trackCardContentVariants({ density })}>
        <div
          className={cn(trackCardIconVariants({ density, hasArtwork }), 'relative aspect-square')}
        >
          {hasArtwork ? (
            <InteractiveArtwork
              src={track.sourceArtworkUrl}
              fallbackSrc={track.sourceArtworkUrl}
              blob={artworkBlob}
              onPlay={() => onPlay()}
              playLabel={t('btnPlayOnly')}
              hoverGroup="episode"
              playControlVisibility="hover-or-touch"
              playPosition="center"
              playIconSize={
                isCompact
                  ? DOWNLOAD_ARTWORK_PLAY_ICON_SIZE.compact
                  : DOWNLOAD_ARTWORK_PLAY_ICON_SIZE.comfortable
              }
              playButtonScale={
                isCompact
                  ? DOWNLOAD_ARTWORK_PLAY_BUTTON_SCALE.compact
                  : DOWNLOAD_ARTWORK_PLAY_BUTTON_SCALE.comfortable
              }
              size="original"
              className="w-full h-full rounded-lg"
            />
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPlay()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label={t('btnPlayOnly')}
              className="h-full w-full rounded-lg text-muted-foreground hover:bg-muted/60"
            >
              <FileAudio
                size={
                  isCompact
                    ? DOWNLOAD_FALLBACK_ARTWORK_ICON_SIZE.compact
                    : DOWNLOAD_FALLBACK_ARTWORK_ICON_SIZE.comfortable
                }
                strokeWidth={1.5}
              />
            </Button>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center w-full mb-0.5 relative">
            <InteractiveTitle
              title={title}
              to={episodeRoute?.to}
              params={episodeRoute?.params}
              className={cn(
                'font-bold text-foreground leading-tight',
                isCompact ? 'text-sm' : 'text-base'
              )}
              maxLines={1}
            />
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground/80 mb-0.5 line-clamp-1 font-normal tracking-tight">
              {subtitle}
            </div>
          )}
          {description && (
            <div
              className={cn(
                'text-xs text-muted-foreground/80 leading-snug font-light mb-1',
                isCompact ? 'line-clamp-1' : 'line-clamp-2'
              )}
            >
              {description}
            </div>
          )}
        </div>

        <div className="flex items-center gap-6 relative">
          <div className="flex items-center text-muted-foreground">
            <div className="flex items-center gap-2 text-xs font-medium tabular-nums whitespace-nowrap w-20">
              <Package size={DOWNLOAD_META_ICON_SIZE} className="shrink-0" />
              <span className="truncate">{sizeLabel}</span>
            </div>
            {durationLabel && (
              <div className="hidden md:flex items-center gap-2 text-xs font-medium tabular-nums whitespace-nowrap w-24">
                <Clock size={DOWNLOAD_META_ICON_SIZE} className="shrink-0" />
                <span className="truncate">{durationLabel}</span>
              </div>
            )}
          </div>
          <div className={cn('flex items-center justify-end gap-2 shrink-0 w-32')}>
            {favorite?.enabled && (
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-9 w-9 text-muted-foreground hover:bg-transparent hover:text-primary transition-opacity duration-200 shrink-0',
                  'opacity-0 group-hover/episode:opacity-100 focus-visible:opacity-100 group-focus-within/episode:opacity-100'
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  favorite.onToggle()
                }}
                aria-label={favorite.favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
              >
                <Star
                  size={16}
                  className={cn(
                    'stroke-2',
                    favorite.favorited && 'fill-current text-primary',
                    favorite.isSaving && 'animate-pulse opacity-50'
                  )}
                />
              </Button>
            )}
            <DownloadTrackOverflowMenu
              hasAudioExportAction={hasAudioExportAction}
              hasSubtitles={subtitles.length > 0}
              onExportAudio={onExportAudio}
              onImportSubtitle={onImportSubtitle}
              onPlayWithoutTranscript={onPlayWithoutTranscript}
              onRemove={onRemove}
              onRetranscribe={onRetranscribe}
              showPlayWithoutTranscriptAction={showPlayWithoutTranscriptAction}
            />
          </div>
        </div>
      </div>

      <DownloadSubtitleList
        track={track}
        subtitles={subtitles}
        density={density}
        subtitleRowTitle={subtitleRowTitle}
        onSetActiveSubtitle={onSetActiveSubtitle}
        onDeleteSubtitle={onDeleteSubtitle}
        onExportSubtitle={onExportSubtitle}
      />
    </div>
  )
}
