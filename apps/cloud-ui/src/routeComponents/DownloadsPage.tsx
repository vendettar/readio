import { Link } from '@tanstack/react-router'
import { Compass, Download } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DownloadTrackCard } from '../components/Downloads/DownloadTrackCard'
import { EpisodeListSkeleton } from '../components/EpisodeRow'
import type { ViewDensity } from '../components/Files/types'
import { ViewControlsBar } from '../components/Files/ViewControlsBar'
import { PageHeader, PageShell } from '../components/layout'
import { OfflineBanner } from '../components/OfflineBanner'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { HiddenFileInput } from '../components/ui/hidden-file-input'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import type { ASRCue } from '../lib/asr/types'
import type { FileSubtitle, PodcastDownload } from '../lib/db/types'
import { mapTrackToDiscovery } from '../lib/discovery/mappers'
import { downloadBlob } from '../lib/download'
import {
  getAllDownloadedTracks,
  removeDownloadedTrack,
  subscribeToDownloads,
} from '../lib/downloadService'
import { selectPlaybackSubtitle } from '../lib/downloads/subtitleSelection'
import { logError, warn as logWarn } from '../lib/logger'
import { resolvePlaybackSource } from '../lib/player/playbackSource'
import {
  canPlayRemoteStreamWithoutTranscript,
  playStreamWithoutTranscriptWithDeps,
} from '../lib/player/remotePlayback'
import {
  RETRANSCRIBE_DOWNLOAD_REASON,
  retranscribeDownloadedTrackWithCurrentSettings,
} from '../lib/remoteTranscript'
import {
  DownloadsRepository,
  IMPORT_SUBTITLE_REASON,
  subscribeToDownloadSubtitles,
} from '../lib/repositories/DownloadsRepository'
import { buildPodcastEpisodeRoute } from '../lib/routes/podcastRoutes'
import { createSubtitleFileSchema, SUBTITLE_EXTENSIONS } from '../lib/schemas/files'
import { generateSlugWithId } from '../lib/slugUtils'
import type { SubtitleExportFormat } from '../lib/subtitles'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'
import { useExploreStore } from '../store/exploreStore'
import { useFilesStore } from '../store/filesStore'
import { usePlayerStore } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'
import { useTranscriptStore } from '../store/transcriptStore'

interface PodcastGroup {
  podcastTitle: string
  tracks: PodcastDownload[]
  totalBytes: number
}

const COMPLETED_RESTORE_THRESHOLD_SECONDS = 2

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
    const key = track.sourcePodcastTitle || 'Unknown Podcast'
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

function buildPlaybackMetadata(track: PodcastDownload) {
  return {
    podcastTitle: track.sourcePodcastTitle,
    artworkUrl: track.sourceArtworkUrl,
    originalAudioUrl: track.sourceUrlNormalized,
    transcriptUrl: track.transcriptUrl,
    durationSeconds: track.durationSeconds,
    countryAtSave: track.countryAtSave,
    podcastFeedUrl: track.sourceFeedUrl,
    providerPodcastId: track.sourceProviderPodcastId,
    providerEpisodeId: track.sourceProviderEpisodeId,
    episodeId: track.sourceProviderEpisodeId,
  }
}

function DownloadedTrackItem({
  track,
  onRemove,
  onToggleFavorite,
  favorited,
  canFavorite,
  artworkBlob,
  subtitles,
  onSetActiveSubtitle,
  onDeleteSubtitle,
  onExportSubtitle,
  onExportAudio,
  onImportSubtitle,
  onRetranscribe,
  density,
}: {
  track: PodcastDownload
  onRemove: (id: string) => Promise<boolean>
  onToggleFavorite: (track: PodcastDownload, favorited: boolean) => Promise<void>
  favorited: boolean
  canFavorite: boolean
  artworkBlob: Blob | null
  subtitles: FileSubtitle[]
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => Promise<void> | void
  onDeleteSubtitle: (trackId: string, fileSubtitleId: string) => Promise<boolean> | boolean
  onExportSubtitle: (
    trackId: string,
    fileSubtitleId: string,
    format: SubtitleExportFormat
  ) => Promise<void> | void
  onExportAudio: (trackId: string) => Promise<void> | void
  onImportSubtitle: (trackId: string) => void
  onRetranscribe: (trackId: string) => Promise<void> | void
  density?: ViewDensity
}) {
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const setSubtitlesStore = useTranscriptStore((s) => s.setSubtitles)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const setSessionId = usePlayerStore((s) => s.setSessionId)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const queueAutoplayAfterPendingSeek = usePlayerStore((s) => s.queueAutoplayAfterPendingSeek)
  const setPlaybackTrackId = usePlayerStore((s) => s.setPlaybackTrackId)
  const setPlayableContext = usePlayerSurfaceStore((s) => s.setPlayableContext)
  const toDocked = usePlayerSurfaceStore((s) => s.toDocked)
  const { isOnline } = useNetworkStatus()

  const resolveSessionRestoreState = useCallback(async () => {
    const session = await DownloadsRepository.getRestoreSessionByTrackId(track.id)
    const sessionProgress = session?.progress ?? 0
    const sessionDuration = session?.durationSeconds ?? 0
    const isSessionComplete =
      sessionDuration > 0 &&
      sessionProgress >= Math.max(0, sessionDuration - COMPLETED_RESTORE_THRESHOLD_SECONDS)
    const resumeAt =
      sessionProgress > 0
        ? isSessionComplete
          ? 0
          : Math.min(sessionProgress, sessionDuration || Infinity)
        : 0

    return { session, resumeAt }
  }, [track.id])

  const handlePlay = useCallback(
    async (overrideSubtitleId?: string) => {
      if (!track.sourceUrlNormalized) return
      const { session, resumeAt } = await resolveSessionRestoreState()
      const source = await resolvePlaybackSource(track.sourceUrlNormalized)

      // Unify reading path through repository (Priority 1: active or override, Priority 2: newest ready)
      const readySubs = await DownloadsRepository.getReadySubtitlesByTrackId(track.id)

      let parsedSubtitles: ASRCue[] = []

      // Card play follows repository priority (active-ready first, then newest-ready).
      // Subtitle-row play can override with an explicit subtitle id.
      const target = selectPlaybackSubtitle(readySubs, overrideSubtitleId)

      if (target) {
        parsedSubtitles = target.subtitle.cues
      }

      const metadata = buildPlaybackMetadata(track)
      setAudioUrl(
        source.url,
        track.sourceEpisodeTitle || track.name,
        track.sourceArtworkUrl || null,
        metadata,
        false
      )

      // Always call setSubtitlesStore to clear any stale state if current track has no selected subtitles
      setSubtitlesStore(parsedSubtitles)

      setSessionId(session?.id ?? null)
      setPlaybackTrackId(source.trackId ?? track.id)
      setPlayableContext(true)
      toDocked()

      if (resumeAt > 0) {
        queueAutoplayAfterPendingSeek()
        seekTo(resumeAt)
      } else {
        play()
      }
    },
    [
      track,
      setAudioUrl,
      play,
      setSessionId,
      queueAutoplayAfterPendingSeek,
      seekTo,
      setPlaybackTrackId,
      setSubtitlesStore,
      setPlayableContext,
      toDocked,
      resolveSessionRestoreState,
    ]
  )

  const handlePlayWithoutTranscript = useCallback(async () => {
    if (!track.sourceUrlNormalized) return
    const { session, resumeAt } = await resolveSessionRestoreState()
    const metadata = buildPlaybackMetadata(track)

    const streamStart = await playStreamWithoutTranscriptWithDeps(
      { setAudioUrl, play, pause, setPlaybackTrackId },
      {
        streamTarget: {
          sourceUrlNormalized: track.sourceUrlNormalized,
        },
        title: track.sourceEpisodeTitle || track.name,
        artwork: track.sourceArtworkUrl || '',
        metadata,
      }
    )

    // Intentionally not surfacing reason yet to keep current UX parity (no new toast/copy behavior).
    if (!streamStart.started) return
    setSessionId(session?.id ?? null)
    setPlayableContext(true)
    toDocked()
    if (resumeAt > 0) {
      queueAutoplayAfterPendingSeek()
      seekTo(resumeAt)
    }
  }, [
    pause,
    play,
    queueAutoplayAfterPendingSeek,
    resolveSessionRestoreState,
    setAudioUrl,
    setPlayableContext,
    setPlaybackTrackId,
    setSessionId,
    seekTo,
    toDocked,
    track,
  ])

  const title = track.sourceEpisodeTitle || track.name
  const canShowPlayWithoutTranscript = canPlayRemoteStreamWithoutTranscript(
    {
      sourceUrlNormalized: track.sourceUrlNormalized,
    },
    isOnline
  )
  const canPlayLocalWithoutTranscript = Boolean(track.audioId) && !track.isCorrupted
  const showPlayWithoutTranscriptAction =
    canPlayLocalWithoutTranscript || canShowPlayWithoutTranscript

  const episodeRoute = useMemo(() => {
    return track.sourceProviderPodcastId && track.sourceProviderEpisodeId && track.countryAtSave
      ? buildPodcastEpisodeRoute({
          country: track.countryAtSave,
          podcastId: track.sourceProviderPodcastId,
          episodeSlug: generateSlugWithId(title, track.sourceProviderEpisodeId),
        })
      : null
  }, [track.sourceProviderPodcastId, track.sourceProviderEpisodeId, track.countryAtSave, title])

  const handleSetActiveWithPlay = useCallback(
    async (trackId: string, subtitleId: string) => {
      await onSetActiveSubtitle(trackId, subtitleId)
      await handlePlay(subtitleId)
    },
    [onSetActiveSubtitle, handlePlay]
  )

  return (
    <DownloadTrackCard
      track={track}
      artworkBlob={artworkBlob}
      subtitles={subtitles}
      density={density}
      favorite={{
        enabled: canFavorite,
        favorited,
        onToggle: () => void onToggleFavorite(track, favorited),
      }}
      onPlay={handlePlay}
      onPlayWithoutTranscript={() => {
        void handlePlayWithoutTranscript()
      }}
      showPlayWithoutTranscriptAction={showPlayWithoutTranscriptAction}
      onRemove={() => onRemove(track.id)}
      onSetActiveSubtitle={handleSetActiveWithPlay}
      onDeleteSubtitle={onDeleteSubtitle}
      onExportSubtitle={(trackId, fileSubtitleId, format) => {
        void onExportSubtitle(trackId, fileSubtitleId, format)
      }}
      onExportAudio={() => {
        void onExportAudio(track.id)
      }}
      onImportSubtitle={() => onImportSubtitle(track.id)}
      onRetranscribe={() => {
        void onRetranscribe(track.id)
      }}
      episodeRoute={episodeRoute}
    />
  )
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

  const getSetting = useFilesStore((s) => s.getSetting)
  const setSetting = useFilesStore((s) => s.setSetting)
  const [density, setDensity] = useState<ViewDensity>('comfortable')

  const loadDensity = useCallback(async () => {
    const saved = await getSetting('downloads.viewDensity')
    if (saved === 'compact') setDensity('compact')
  }, [getSetting])

  useEffect(() => {
    void loadDensity()
  }, [loadDensity])

  const handleDensityChange = useCallback(
    async (value: ViewDensity) => {
      setDensity(value)
      try {
        await setSetting('downloads.viewDensity', value)
      } catch (err) {
        logWarn('[Downloads] Failed to persist density setting', err)
      }
    },
    [setSetting]
  )

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
    return new Set(favorites.map((f) => `${f.feedUrl}::${f.audioUrl}`))
  }, [favorites])

  const handleToggleFavorite = useCallback(
    async (track: PodcastDownload, favoritedCurrent: boolean) => {
      if (!track.sourceFeedUrl || !track.sourceUrlNormalized) return
      const key = `${track.sourceFeedUrl}::${track.sourceUrlNormalized}`

      if (favoritedCurrent) {
        await removeFavorite(key)
      } else {
        const { podcast, episode } = mapTrackToDiscovery(track)
        await addFavorite(podcast, episode, undefined, track.countryAtSave)
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
                      track.sourceFeedUrl && track.sourceUrlNormalized
                        ? favoriteKeysSet.has(
                            `${track.sourceFeedUrl}::${track.sourceUrlNormalized}`
                          )
                        : false
                    const canFavorite = !!(track.sourceFeedUrl && track.sourceUrlNormalized)

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
