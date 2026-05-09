import { CircleArrowDown, Download } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildDownloadJobOptionsFromCanonicalRemoteMetadata,
  downloadEpisode,
  removeDownloadedTrack,
} from '../../lib/downloadService'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../store/playerStore'
import { Button } from '../ui/button'
import { CircularProgress } from '../ui/circular-progress'
import { usePlayerDownloadSource } from './usePlayerDownloadSource'

export function PlayerDownloadAction({ className }: { className?: string }) {
  const { t } = useTranslation()
  const audioUrl = usePlayerStore((s) => s.audioUrl)
  const audioTitle = usePlayerStore((s) => s.audioTitle)
  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const { canonicalRemoteSource, isDownloadable, sourceIdentityUrl, status } =
    usePlayerDownloadSource({
      audioUrl,
      metadata: episodeMetadata,
    })
  const handleAction = useCallback(() => {
    if (!sourceIdentityUrl || !audioTitle) return

    if (status.downloadStatus === 'downloading') return

    if (status.downloadStatus === 'downloaded' && status.localTrackId) {
      void removeDownloadedTrack(status.localTrackId).then(() => {
        status.refresh()
      })
      return
    }

    if (!canonicalRemoteSource) return

    const downloadOptions = buildDownloadJobOptionsFromCanonicalRemoteMetadata({
      audioUrl: canonicalRemoteSource.audioUrl,
      episodeTitle: audioTitle,
      metadata: canonicalRemoteSource.metadata,
    })
    if (!downloadOptions) return

    void downloadEpisode(downloadOptions).then(() => {
      status.refresh()
    })
  }, [audioTitle, canonicalRemoteSource, sourceIdentityUrl, status])

  if (!sourceIdentityUrl || !isDownloadable) return null

  if (status.downloadStatus === 'downloading') {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn('text-muted-foreground', className)}
        aria-label={t('downloadEpisodeDownloading')}
      >
        <CircularProgress progress={status.progress || 0} size={18} strokeWidth={2} />
      </Button>
    )
  }

  if (status.downloadStatus === 'downloaded') {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleAction}
        className={cn('text-primary', className)}
        aria-label={t('downloadRemove')}
        title={t('downloadRemove')}
      >
        <CircleArrowDown
          size={18}
          className="text-primary [&_circle]:fill-current [&_path]:stroke-background [&_path]:stroke-[1.5]"
        />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleAction}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      aria-label={t('downloadEpisode')}
      title={t('downloadEpisode')}
    >
      <Download size={18} />
    </Button>
  )
}

export function DownloadedBadge({
  audioUrl,
  className,
}: {
  audioUrl?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const { status } = usePlayerDownloadSource({
    audioUrl,
    metadata: episodeMetadata,
  })
  if (status.downloadStatus !== 'downloaded') return null

  return (
    <div
      className={cn(
        'inline-flex items-center justify-center p-0.5 rounded-full bg-primary/10 text-primary',
        className
      )}
      title={t('episodeStatusDownloaded')}
    >
      <CircleArrowDown
        size={12}
        className="text-primary [&_circle]:fill-current [&_path]:stroke-background [&_path]:stroke-[1.5]"
      />
    </div>
  )
}
