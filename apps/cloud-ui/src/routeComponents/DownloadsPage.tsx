import { Link } from '@tanstack/react-router'
import { Compass, Download } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DownloadedTrackItem } from '../components/Downloads/DownloadedTrackItem'
import { EpisodeListSkeleton } from '../components/EpisodeRow'
import { ViewControlsBar } from '../components/Files/ViewControlsBar'
import { PageHeader, PageShell } from '../components/layout'
import { OfflineBanner } from '../components/OfflineBanner'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { HiddenFileInput } from '../components/ui/hidden-file-input'
import { useViewDensity } from '../hooks/useViewDensity'
import { buildFavoriteKey, buildFavoriteKeyFromFavorite } from '../lib/db/favoriteIdentity'
import { mapPodcastDownloadToFavoriteInputs } from '../lib/db/favoriteMappers'
import type { FileSubtitle, PodcastDownload } from '../lib/db/types'
import { downloadBlob } from '../lib/download'
import {
  getAllDownloadedTracks,
  removeDownloadedTrack,
  subscribeToDownloads,
} from '../lib/downloadService'
import { logError } from '../lib/logger'
import {
  RETRANSCRIBE_DOWNLOAD_REASON,
  retranscribeDownloadedTrackWithCurrentSettings,
} from '../lib/remoteTranscript'
import {
  DownloadsRepository,
  IMPORT_SUBTITLE_REASON,
  subscribeToDownloadSubtitles,
} from '../lib/repositories/DownloadsRepository'
import { createSubtitleFileSchema, SUBTITLE_EXTENSIONS } from '../lib/schemas/files'
import type { SubtitleExportFormat } from '../lib/subtitles'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'
import { useExploreStore } from '../store/exploreStore'

interface PodcastGroup {
  podcastTitle: string
  tracks: PodcastDownload[]
  totalBytes: number
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read subtitle file'))
    reader.readAsText(file)
  })
}

function groupByPodcast(tracks: PodcastDownload[]): PodcastGroup[] {
  const groups = new Map<string, PodcastDownload[]>()

  for (const track of tracks) {
    const key = track.sourcePodcastItunesId || track.sourcePodcastTitle || 'Unknown Podcast'
    const existing = groups.get(key)
    if (existing) {
      existing.push(track)
    } else {
      groups.set(key, [track])
    }
  }

  return Array.from(groups.entries()).map(([podcastTitle, groupTracks]) => ({
    podcastTitle,
    tracks: groupTracks.sort((a, b) => (b.downloadedAt ?? 0) - (a.downloadedAt ?? 0)),
    totalBytes: groupTracks.reduce((sum, t) => sum + t.sizeBytes, 0),
  }))
}

export default function DownloadsPage() {
  const { t } = useTranslation()
  const [tracks, setTracks] = useState<PodcastDownload[]>([])
  const [loading, setLoading] = useState(true)
  const [artworkBlobs, setArtworkBlobs] = useState<Record<string, Blob | null>>({})
  const [fileSubtitles, setFileSubtitles] = useState<Record<string, FileSubtitle[]>>({})
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const [targetTrackId, setTargetTrackId] = useState<string | null>(null)
  const targetTrackIdRef = useRef<string | null>(null)
  const loadSeqRef = useRef(0)
  const reloadQueuedRef = useRef(false)

  const { density, handleDensityChange } = useViewDensity('downloads.viewDensity')

  const loadTracks = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    try {
      const downloaded = await getAllDownloadedTracks()
      if (loadSeqRef.current !== seq) return

      setTracks(downloaded)

      // Load artwork blobs & subtitles for all tracks in parallel
      const blobs: Record<string, Blob | null> = {}
      const subs: Record<string, FileSubtitle[]> = {}
      const results = await Promise.all(
        downloaded.map(async (track) => {
          const [artworkResult, subtitlesResult] = await Promise.allSettled([
            DownloadsRepository.getTrackArtworkBlob(track.artworkId),
            DownloadsRepository.getTrackSubtitles(track.id),
          ])

          const artwork = artworkResult.status === 'fulfilled' ? artworkResult.value : null
          if (artworkResult.status === 'rejected') {
            logError(
              '[DownloadsPage] Failed to load artwork for track:',
              track.id,
              artworkResult.reason
            )
          }

          const trackSubs = subtitlesResult.status === 'fulfilled' ? subtitlesResult.value : []
          if (subtitlesResult.status === 'rejected') {
            logError(
              '[DownloadsPage] Failed to load subtitles for track:',
              track.id,
              subtitlesResult.reason
            )
          }

          return { id: track.id, artwork, subs: trackSubs }
        })
      )

      if (loadSeqRef.current !== seq) return

      results.forEach((r) => {
        blobs[r.id] = r.artwork
        subs[r.id] = r.subs
      })

      setArtworkBlobs(blobs)
      setFileSubtitles(subs)
    } catch (err) {
      logError('[DownloadsPage] Failed to load tracks:', err)
    } finally {
      if (loadSeqRef.current === seq) {
        setLoading(false)
      }
    }
  }, [])

  const requestReload = useCallback(() => {
    if (reloadQueuedRef.current) return
    reloadQueuedRef.current = true
    void Promise.resolve().then(() => {
      reloadQueuedRef.current = false
      void loadTracks()
    })
  }, [loadTracks])

  // Favorites logic (Best Practice: same pattern as HistoryPage)
  const favorites = useExploreStore((s) => s.favorites)
  const addFavorite = useExploreStore((s) => s.addFavorite)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)

  const favoriteKeysSet = useMemo(() => {
    return new Set(favorites.map((favorite) => buildFavoriteKeyFromFavorite(favorite)))
  }, [favorites])

  const handleToggleFavorite = useCallback(
    async (track: PodcastDownload, favoritedCurrent: boolean) => {
      const key = buildFavoriteKey(track.sourcePodcastItunesId, track.sourceEpisodeGuid)
      if (!key) return

      if (favoritedCurrent) {
        await removeFavorite(key)
      } else {
        const favoriteInputs = mapPodcastDownloadToFavoriteInputs(track)
        if (!favoriteInputs) return

        await addFavorite(
          favoriteInputs.podcast,
          favoriteInputs.episode,
          undefined,
          track.countryAtSave
        )
      }
    },
    [addFavorite, removeFavorite]
  )

  useEffect(() => {
    void loadTracks()
    const unsubscribeDownloads = subscribeToDownloads(requestReload)
    const unsubscribeSubtitles = subscribeToDownloadSubtitles(requestReload)
    return () => {
      unsubscribeDownloads()
      unsubscribeSubtitles()
    }
  }, [loadTracks, requestReload])

  const groups = useMemo(() => groupByPodcast(tracks), [tracks])

  const handleRemoveTrack = useCallback(
    async (trackId: string) => {
      const success = await removeDownloadedTrack(trackId)
      if (success) {
        toast.successKey('toastDeleted')
        void loadTracks()
        return true
      }
      toast.errorKey('toastDeleteFailed')
      return false
    },
    [loadTracks]
  )

  const handleSetActiveSubtitle = useCallback(
    async (trackId: string, subtitleId: string) => {
      await DownloadsRepository.setActiveSubtitle(trackId, subtitleId, true)
      void loadTracks()
    },
    [loadTracks]
  )

  const handleDeleteSubtitle = useCallback(
    async (trackId: string, fileSubtitleId: string) => {
      try {
        const deleted = await DownloadsRepository.deleteSubtitleVersion(trackId, fileSubtitleId)
        if (!deleted) {
          toast.errorKey('toastDeleteFailed')
          return false
        }
        void loadTracks()
        return true
      } catch (err) {
        logError('[DownloadsPage] Failed to delete subtitle version', err)
        toast.errorKey('toastDeleteFailed')
        return false
      }
    },
    [loadTracks]
  )

  const handleExportSubtitle = useCallback(
    async (trackId: string, fileSubtitleId: string, format: SubtitleExportFormat) => {
      const track = tracks.find((item) => item.id === trackId)
      if (!track) return

      const result = await DownloadsRepository.exportSubtitleVersion(
        trackId,
        fileSubtitleId,
        track.sourceEpisodeTitle || track.name,
        format
      )
      if (result.ok && result.blob && result.filename) {
        downloadBlob(result.blob, result.filename)
        return
      }

      toast.errorKey('subtitleVersionExportFailed')
    },
    [tracks]
  )

  const handleImportSubtitle = useCallback((trackId: string) => {
    targetTrackIdRef.current = trackId
    setTargetTrackId(trackId)
    subtitleInputRef.current?.click()
  }, [])

  const handleExportAudio = useCallback(
    async (trackId: string) => {
      const track = tracks.find((item) => item.id === trackId)
      if (!track) return

      const result = await DownloadsRepository.exportAudioFile(
        trackId,
        track.sourceEpisodeTitle || track.name
      )
      if (result.ok && result.blob && result.filename) {
        downloadBlob(result.blob, result.filename)
        return
      }

      toast.errorKey('subtitleVersionExportFailed')
    },
    [tracks]
  )

  const handleRetranscribe = useCallback(
    async (trackId: string) => {
      const result = await retranscribeDownloadedTrackWithCurrentSettings(trackId)
      if (!result.ok) {
        if (result.reason === RETRANSCRIBE_DOWNLOAD_REASON.UNCONFIGURED) {
          toast.errorKey('asrKeyInvalid')
          window.dispatchEvent(
            new CustomEvent('readio:navigate', {
              detail: { to: '/settings', hash: 'asr' },
            })
          )
        }
        return
      }
      await loadTracks()
    },
    [loadTracks]
  )

  const handleSubtitleImportInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const resetInput = () => {
        targetTrackIdRef.current = null
        setTargetTrackId(null)
        if (subtitleInputRef.current) {
          subtitleInputRef.current.value = ''
        }
      }

      const activeTrackId = targetTrackIdRef.current ?? targetTrackId
      const file = event.target.files?.[0]
      if (!activeTrackId || !file) {
        resetInput()
        return
      }

      try {
        const validation = createSubtitleFileSchema().safeParse(file)
        if (!validation.success) {
          const messageKey = validation.error.issues[0]?.message as TranslationKey | undefined
          if (messageKey) {
            toast.errorKey(messageKey)
          } else {
            toast.errorKey('toastFileValidationError')
          }
          return
        }

        const content = await readFileAsText(file)
        const importResult = await DownloadsRepository.importSubtitleVersion(activeTrackId, {
          filename: file.name,
          content,
        })

        if (importResult.ok) {
          await loadTracks()
          return
        }

        if (importResult.reason === IMPORT_SUBTITLE_REASON.INVALID_SUBTITLE_CONTENT) {
          toast.errorKey('validationInvalidSubtitleFormat')
          return
        }
        toast.errorKey('toastUploadFailed')
      } catch (err) {
        logError('[DownloadsPage] Failed to import subtitle', err)
        toast.errorKey('toastUploadFailed')
      } finally {
        resetInput()
      }
    },
    [loadTracks, targetTrackId]
  )

  return (
    <PageShell>
      <OfflineBanner />
      <HiddenFileInput
        accept={SUBTITLE_EXTENSIONS.join(',')}
        ref={subtitleInputRef}
        data-testid="downloads-subtitle-input"
        onChange={handleSubtitleImportInputChange}
      />
      <PageHeader title={t('downloadsTitle')} subtitle={t('downloadsSubtitle')} />

      <ViewControlsBar density={density} onDensityChange={handleDensityChange} />

      {/* Content */}
      {loading && tracks.length === 0 && <EpisodeListSkeleton label={t('loading')} />}

      {!loading && tracks.length === 0 && (
        <EmptyState
          icon={Download}
          title={t('downloadsEmpty')}
          description={t('downloadsEmptyDesc')}
          action={
            <Button asChild>
              <Link to="/explore">
                <Compass className="w-4 h-4 me-2" />
                {t('navExplore')}
              </Link>
            </Button>
          }
        />
      )}

      {tracks.length > 0 && (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Revalidation Indicator */}
          {loading && (
            <div className="flex items-center gap-2 px-1 py-4 text-xs text-muted-foreground animate-pulse">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
              <span>{t('loading')}</span>
            </div>
          )}
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.podcastTitle} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-foreground">{group.podcastTitle}</h3>
                </div>
                <div
                  className={density === 'compact' ? 'flex flex-col gap-2' : 'flex flex-col gap-4'}
                >
                  {group.tracks.map((track) => {
                    const favorited =
                      track.sourcePodcastItunesId && track.sourceEpisodeGuid
                        ? favoriteKeysSet.has(
                            buildFavoriteKey(track.sourcePodcastItunesId, track.sourceEpisodeGuid)
                          )
                        : false
                    const canFavorite = !!(track.sourcePodcastItunesId && track.sourceEpisodeGuid)

                    return (
                      <DownloadedTrackItem
                        key={track.id}
                        track={track}
                        onRemove={handleRemoveTrack}
                        onToggleFavorite={handleToggleFavorite}
                        favorited={!!favorited}
                        canFavorite={canFavorite}
                        artworkBlob={artworkBlobs[track.id] || null}
                        subtitles={fileSubtitles[track.id] || []}
                        onSetActiveSubtitle={handleSetActiveSubtitle}
                        onDeleteSubtitle={handleDeleteSubtitle}
                        onExportSubtitle={handleExportSubtitle}
                        onExportAudio={handleExportAudio}
                        onImportSubtitle={handleImportSubtitle}
                        onRetranscribe={handleRetranscribe}
                        density={density}
                      />
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageShell>
  )
}
