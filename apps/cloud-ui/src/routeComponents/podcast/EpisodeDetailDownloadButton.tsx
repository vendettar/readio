import { ArrowDown, CircleArrowDown } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { CircularProgress } from '@/components/ui/circular-progress'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEpisodeStatus } from '@/hooks/useEpisodeStatus'
import { downloadEpisode, removeDownloadedTrack } from '@/lib/downloadService'
import { logError } from '@/lib/logger'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'
import { getAppConfig } from '@/lib/runtimeConfig'
import { cn } from '@/lib/utils'

interface EpisodeDetailDownloadButtonProps {
  episodeTitle: string
  episodeDescription?: string
  podcastTitle: string
  feedUrl?: string
  audioUrl: string
  transcriptUrl?: string
  artworkUrl?: string
  countryAtSave?: string
  providerPodcastId?: string
  providerEpisodeId?: string
  durationSeconds?: number
  className?: string
}

export function EpisodeDetailDownloadButton({
  episodeTitle,
  episodeDescription,
  podcastTitle,
  feedUrl,
  audioUrl,
  transcriptUrl,
  artworkUrl,
  countryAtSave,
  providerPodcastId,
  providerEpisodeId,
  durationSeconds,
  className,
}: EpisodeDetailDownloadButtonProps) {
  const { t } = useTranslation()
  const status = useEpisodeStatus(audioUrl)
  const defaultCountry = getAppConfig().DEFAULT_COUNTRY
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const handleDownload = useCallback(() => {
    if (status.downloadStatus === 'downloading') return

    const normalizedCountryAtSave = normalizeCountryParam(countryAtSave) ?? defaultCountry

    // Initiate download
    void downloadEpisode({
      audioUrl,
      episodeTitle,
      episodeDescription,
      podcastTitle,
      feedUrl,
      artworkUrl,
      transcriptUrl,
      countryAtSave: normalizedCountryAtSave,
      providerPodcastId,
      providerEpisodeId,
      durationSeconds,
    }).then(() => {
      status.refresh()
    })
  }, [
    audioUrl,
    episodeTitle,
    episodeDescription,
    podcastTitle,
    feedUrl,
    artworkUrl,
    transcriptUrl,
    countryAtSave,
    providerPodcastId,
    providerEpisodeId,
    durationSeconds,
    defaultCountry,
    status.downloadStatus,
    status.refresh,
  ])

  const handleConfirmRemove = useCallback(async () => {
    if (isRemoving || !status.localTrackId) return
    setIsRemoving(true)
    try {
      await removeDownloadedTrack(status.localTrackId)
      status.refresh()
      setConfirmOpen(false)
    } catch (error) {
      logError('Failed to remove downloaded track:', error)
      // Error feedback could be added here (e.g., toast notification)
    } finally {
      setIsRemoving(false)
    }
  }, [isRemoving, status.localTrackId, status.refresh])

  if (status.downloadStatus === 'downloaded') {
    return (
      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'w-8 h-8 rounded-full hover:bg-transparent opacity-100 flex items-center justify-center transition-all active:scale-95 [&_svg]:!w-full [&_svg]:!h-full',
              className
            )}
            aria-label={t('downloadRemove')}
          >
            <CircleArrowDown className="scale-[1.09] text-primary [&_circle]:fill-current [&_path]:stroke-background [&_path]:stroke-[1.5]" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          className="w-64 p-4 rounded-xl shadow-2xl"
        >
          <div className="text-sm font-medium text-foreground">
            {t('downloadsRemoveConfirmTitle')}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {t('downloadsRemoveConfirmDesc')}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isRemoving}
              onClick={() => setConfirmOpen(false)}
            >
              {t('commonCancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isRemoving}
              onClick={() => void handleConfirmRemove()}
            >
              {t('downloadRemove')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  if (status.downloadStatus === 'downloading') {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn(
          'w-8 h-8 rounded-full bg-primary/10 pointer-events-none opacity-100',
          className
        )}
        aria-label={t('downloadEpisodeDownloading')}
      >
        <CircularProgress progress={status.progress || 0} size={16} strokeWidth={2.5} />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDownload}
      className={cn(
        'w-8 h-8 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-all active:scale-95',
        className
      )}
      aria-label={t('downloadEpisode')}
    >
      <ArrowDown size={16} strokeWidth={2.5} />
    </Button>
  )
}
