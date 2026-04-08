import { CircleArrowDown, Download } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeCountryParam } from '@/lib/routes/podcastRoutes'
import { getAppConfig } from '@/lib/runtimeConfig'
import { cn } from '@/lib/utils'
import { type EpisodeStatus, useEpisodeStatus } from '../../hooks/useEpisodeStatus'
import { downloadEpisode } from '../../lib/downloadService'
import { Button } from '../ui/button'
import { CircularProgress } from '../ui/circular-progress'

interface DownloadEpisodeButtonProps {
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
  /** Pre-computed status from parent to avoid duplicate useEpisodeStatus calls */
  episodeStatus?: EpisodeStatus
}

export function DownloadEpisodeButton({
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
  episodeStatus,
}: DownloadEpisodeButtonProps) {
  const { t } = useTranslation()
  const defaultCountry = getAppConfig().DEFAULT_COUNTRY
  const ownStatus = useEpisodeStatus(episodeStatus ? undefined : audioUrl)
  const status = episodeStatus ?? ownStatus

  const handleDownload = useCallback(() => {
    if (status.downloadStatus === 'downloaded' || status.downloadStatus === 'downloading') return

    const normalizedCountryAtSave = normalizeCountryParam(countryAtSave) ?? defaultCountry

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
    defaultCountry,
    providerPodcastId,
    providerEpisodeId,
    durationSeconds,
    status.downloadStatus,
    status.refresh,
  ])

  if (status.downloadStatus === 'downloaded') {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn('w-8 h-8 text-primary disabled:opacity-100 opacity-100', className)}
        aria-label={t('downloadEpisodeDownloaded')}
      >
        <CircleArrowDown
          size={15}
          className="text-primary [&_circle]:fill-current [&_path]:stroke-background [&_path]:stroke-[1.5]"
        />
      </Button>
    )
  }

  if (status.downloadStatus === 'downloading') {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className={cn('w-8 h-8 text-muted-foreground opacity-100', className)}
        aria-label={t('downloadEpisodeDownloading')}
      >
        <CircularProgress progress={status.progress || 0} size={15} strokeWidth={2} />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleDownload}
      className={cn(
        'w-8 h-8 text-muted-foreground hover:bg-transparent hover:text-primary transition-opacity duration-200',
        'opacity-0 group-hover/episode:opacity-100 focus-visible:opacity-100 group-focus-within/episode:opacity-100',
        className
      )}
      aria-label={t('downloadEpisode')}
    >
      <Download size={15} className="stroke-2" />
    </Button>
  )
}
