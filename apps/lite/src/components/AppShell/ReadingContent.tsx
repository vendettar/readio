import { Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { usePlayerController } from '../../hooks/usePlayerController'
import { useZoom } from '../../hooks/useZoom'
import { getAsrReadinessUpdatedEventName, isAsrReadyForGeneration } from '../../lib/asr/readiness'
import { useDownloadProgressStore } from '../../lib/downloadService'
import { normalizePodcastAudioUrl } from '../../lib/networking/urlUtils'
import { PLAYBACK_REQUEST_MODE } from '../../lib/player/playbackMode'
import { startOnlineASRForCurrentTrack } from '../../lib/remoteTranscript'
import { findSubtitleIndex } from '../../lib/subtitles'
import { usePlayerStore } from '../../store/playerStore'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { TRANSCRIPT_INGESTION_STATUS, useTranscriptStore } from '../../store/transcriptStore'
import { TranscriptView } from '../Transcript'
import { Button } from '../ui/button'
import { CircularProgress } from '../ui/circular-progress'
import { ZoomControl } from '../ZoomControl'
import styles from './FullPlayer.module.css'

interface ReadingContentProps {
  /** Whether to show the full-player style placeholder (larger, with emoji icons) */
  variant: 'docked' | 'full'
  /** Shared state for transcript auto-scrolling */
  isAutoScrolling: boolean
  /** Shared setter for transcript auto-scrolling */
  setIsAutoScrolling: (val: boolean) => void
}

const NO_TRANSCRIPT_ARTWORK_SIZE_STYLE = {
  width: 'min(600px, calc(100vw - 4rem), calc(100vh - 14rem))',
  height: 'min(600px, calc(100vw - 4rem), calc(100vh - 14rem))',
} as const

interface NoTranscriptArtworkProps {
  coverArtUrl: string | null
  audioTitle: string
  untitledLabel: string
  className: string
}

function NoTranscriptArtwork({
  coverArtUrl,
  audioTitle,
  untitledLabel,
  className,
}: NoTranscriptArtworkProps) {
  return (
    <div
      data-testid="no-transcript-artwork"
      className={className}
      style={NO_TRANSCRIPT_ARTWORK_SIZE_STYLE}
    >
      {coverArtUrl ? (
        <img
          data-testid="no-transcript-artwork-image"
          src={coverArtUrl}
          alt={audioTitle || untitledLabel}
          className="absolute inset-0 h-full w-full max-w-none object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          <span className="text-3xl font-serif">Readio</span>
        </div>
      )}
    </div>
  )
}

/**
 * Shared reading content that renders transcript, zoom controls,
 * and placeholder states. Stays mounted across docked <-> full
 * mode transitions to preserve scroll position and local state.
 */
export function ReadingContent({
  variant,
  isAutoScrolling,
  setIsAutoScrolling,
}: ReadingContentProps) {
  const { t } = useTranslation()
  const { zoomScale, showZoomBar, zoomIn, zoomOut, zoomReset, setShowZoomBar, scheduleHide } =
    useZoom()

  const subtitles = useTranscriptStore((s) => s.subtitles)
  const partialAsrCues = useTranscriptStore((s) => s.partialAsrCues)
  const currentIndex = useTranscriptStore((s) => s.currentIndex)
  const subtitlesLoaded = useTranscriptStore((s) => s.subtitlesLoaded)
  const transcriptIngestionStatus = useTranscriptStore((s) => s.transcriptIngestionStatus)
  const progress = usePlayerStore((s) => s.progress)
  const setCurrentIndex = useTranscriptStore((s) => s.setCurrentIndex)
  const transcriptIngestionError = useTranscriptStore((s) => s.transcriptIngestionError)
  const audioUrl = usePlayerStore((s) => s.audioUrl)
  const audioTitle = usePlayerStore((s) => s.audioTitle)
  const coverArtUrl = usePlayerStore((s) => s.coverArtUrl)
  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const toMini = usePlayerSurfaceStore((s) => s.toMini)
  const { jumpToSubtitle } = usePlayerController()

  const targetAudioUrl = episodeMetadata?.originalAudioUrl || audioUrl || ''
  const normalizedAudioUrlKey = normalizePodcastAudioUrl(targetAudioUrl)
  const currentProgress = useDownloadProgressStore((s) =>
    normalizedAudioUrlKey ? s.progressMap[normalizedAudioUrlKey] : null
  )
  const downloadPercentage = currentProgress?.percent ?? null

  const isFull = variant === 'full'
  const displaySubtitles =
    subtitlesLoaded && subtitles.length > 0 ? subtitles : partialAsrCues || []
  const hasDisplaySubtitles = displaySubtitles.length > 0
  const isActiveTranscribing =
    transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.TRANSCRIBING
  const [asrGenerationReady, setAsrGenerationReady] = useState<boolean | null>(null)
  const [asrReadinessVersion, setAsrReadinessVersion] = useState(0)
  const asrReadinessVersionRef = useRef(0)

  const isTranscriptLoading =
    transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.LOADING ||
    (isActiveTranscribing && !hasDisplaySubtitles)

  const loadingLabel = isActiveTranscribing
    ? t('asrTranscribing')
    : transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.LOADING
      ? t('asrDownloading')
      : t('loading')
  const shouldEvaluateAsrReadiness =
    !hasDisplaySubtitles && Boolean(targetAudioUrl) && !isActiveTranscribing
  const canGenerateTranscript = shouldEvaluateAsrReadiness && asrGenerationReady === true
  const shouldShowAsrSettingsCta =
    shouldEvaluateAsrReadiness && asrGenerationReady !== null && asrGenerationReady === false
  const blobUrl = useImageObjectUrl(coverArtUrl instanceof Blob ? coverArtUrl : null)
  const effectiveCoverArtUrl = typeof coverArtUrl === 'string' ? coverArtUrl : blobUrl
  const isDockedStreamWithoutTranscript =
    variant === 'docked' &&
    episodeMetadata?.playbackRequestMode === PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT &&
    Boolean(audioTitle)
  const openAsrSettings = useCallback(() => {
    if (variant === 'docked') {
      toMini()
    }
    window.dispatchEvent(
      new CustomEvent('readio:navigate', {
        detail: { to: '/settings', hash: 'asr' },
      })
    )
  }, [toMini, variant])

  useEffect(() => {
    const handleAsrReadinessUpdated = () => {
      asrReadinessVersionRef.current += 1
      setAsrReadinessVersion(asrReadinessVersionRef.current)
    }
    const asrReadinessEventName = getAsrReadinessUpdatedEventName()
    window.addEventListener(asrReadinessEventName, handleAsrReadinessUpdated)
    window.addEventListener('readio-settings-updated', handleAsrReadinessUpdated)
    return () => {
      window.removeEventListener(asrReadinessEventName, handleAsrReadinessUpdated)
      window.removeEventListener('readio-settings-updated', handleAsrReadinessUpdated)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const runVersion = asrReadinessVersion

    if (!shouldEvaluateAsrReadiness) {
      setAsrGenerationReady(null)
      return () => {
        isCancelled = true
      }
    }

    setAsrGenerationReady(null)

    void (async () => {
      const ready = await isAsrReadyForGeneration()
      if (!isCancelled && runVersion === asrReadinessVersionRef.current) {
        setAsrGenerationReady(ready)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [shouldEvaluateAsrReadiness, asrReadinessVersion])

  // Subtitle synchronization
  useEffect(() => {
    if (displaySubtitles.length > 0) {
      const idx = findSubtitleIndex(displaySubtitles, progress, currentIndex)
      if (idx !== -1 && idx !== currentIndex) {
        setCurrentIndex(idx)
      }
    }
  }, [progress, displaySubtitles, currentIndex, setCurrentIndex])

  if (isDockedStreamWithoutTranscript) {
    return (
      <div
        data-testid="docked-stream-only-artwork"
        className="flex h-full w-full items-center justify-center p-8"
      >
        <div className="relative h-72 w-72 overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-border/50">
          {effectiveCoverArtUrl ? (
            <img
              data-testid="docked-stream-only-artwork-image"
              src={effectiveCoverArtUrl}
              alt={audioTitle || t('untitled')}
              className="absolute inset-0 h-full w-full max-w-none object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
              <span className="text-3xl font-serif">Readio</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (hasDisplaySubtitles) {
    return (
      <>
        {/* If transcribing AND showing partials, show a tiny pulsing indicator */}
        {isActiveTranscribing && (
          <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-background/80 backdrop-blur rounded-full shadow-sm z-10 animate-pulse border">
            <Loader2 size={12} className="animate-spin text-primary" />
            <span className="text-xs font-medium text-primary">{t('asrTranscribing')}</span>
          </div>
        )}

        <TranscriptView
          subtitles={displaySubtitles}
          currentIndex={currentIndex}
          onJumpToSubtitle={jumpToSubtitle}
          isFollowing={isAutoScrolling}
          onFollowingChange={setIsAutoScrolling}
          zoomScale={zoomScale}
        />

        <ZoomControl
          zoomScale={zoomScale}
          isVisible={showZoomBar}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={zoomReset}
          onMouseEnter={() => setShowZoomBar(true)}
          onMouseLeave={scheduleHide}
        />
      </>
    )
  }

  if (isTranscriptLoading) {
    const showCircularProgress =
      transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.LOADING &&
      downloadPercentage !== null

    return isFull ? (
      <div className="flex flex-col items-center justify-center min-h-full-player-placeholder text-center opacity-80">
        <div className="w-16 h-16 mb-6 rounded-full bg-muted flex items-center justify-center">
          {showCircularProgress ? (
            <CircularProgress progress={downloadPercentage} size={48} strokeWidth={4} />
          ) : (
            <Loader2 size={24} className={`animate-spin ${styles.animationPaused}`} />
          )}
        </div>
        <p className="text-xl font-serif text-muted-foreground mb-2">
          {loadingLabel}
          {showCircularProgress ? ` ${downloadPercentage}%` : ''}
        </p>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-70">
        {showCircularProgress ? (
          <CircularProgress
            progress={downloadPercentage}
            size={24}
            strokeWidth={3}
            className="mb-3 text-muted-foreground"
          />
        ) : (
          <Loader2 size={24} className="animate-spin text-muted-foreground mb-3" />
        )}
        <p className="text-muted-foreground">
          {loadingLabel}
          {showCircularProgress ? ` ${downloadPercentage}%` : ''}
        </p>
      </div>
    )
  }

  if (transcriptIngestionStatus === TRANSCRIPT_INGESTION_STATUS.FAILED) {
    return isFull ? (
      <div className="flex flex-col items-center justify-center min-h-full-player-placeholder text-center p-6">
        <div className="w-16 h-16 mb-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="text-xl font-serif text-foreground mb-6">
          {transcriptIngestionError?.code === 'network_error'
            ? t('asrErrorDownloadFailed')
            : t('asrErrorTitle')}
        </p>
        <div className="flex flex-col gap-2 w-full max-w-60">
          <Button
            variant="secondary"
            onClick={() => startOnlineASRForCurrentTrack('manual')}
            className="w-full font-semibold"
          >
            {t('asrRetry')}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              useTranscriptStore
                .getState()
                .setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.IDLE)
            }
            className="w-full text-muted-foreground"
          >
            {t('asrPlayAnyway')}
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-destructive/5 cursor-default">
        <p className="text-sm font-medium text-destructive mb-4">
          {transcriptIngestionError?.code === 'network_error'
            ? t('asrErrorDownloadFailed')
            : t('asrErrorTitle')}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => startOnlineASRForCurrentTrack('manual')}
            className="h-8 px-4 text-xs font-semibold"
          >
            {t('asrRetry')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              useTranscriptStore
                .getState()
                .setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.IDLE)
            }
            className="h-8 px-4 text-xs text-muted-foreground"
          >
            {t('asrPlayAnyway')}
          </Button>
        </div>
      </div>
    )
  }

  // No transcript available
  return isFull ? (
    <div className="flex flex-col items-center justify-center min-h-full-player-placeholder text-center">
      <NoTranscriptArtwork
        coverArtUrl={effectiveCoverArtUrl}
        audioTitle={audioTitle}
        untitledLabel={t('untitled')}
        className="relative mb-6 overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-border/50"
      />
      <p className="text-xl font-serif text-muted-foreground/80 mb-2">{t('noTranscript')}</p>
      <p className="text-sm text-muted-foreground/80">{t('pureListeningMode')}</p>
      {canGenerateTranscript ? (
        <Button
          className="mt-4"
          onClick={() => {
            startOnlineASRForCurrentTrack('manual')
          }}
        >
          {t('asrGenerateSubtitles')}
        </Button>
      ) : shouldShowAsrSettingsCta ? (
        <Button variant="secondary" className="mt-4" onClick={openAsrSettings}>
          {t('asrSetupSubtitleGeneration')}
        </Button>
      ) : null}
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <NoTranscriptArtwork
        coverArtUrl={effectiveCoverArtUrl}
        audioTitle={audioTitle}
        untitledLabel={t('untitled')}
        className="relative mb-4 overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-border/50"
      />
      <p className="text-muted-foreground/80">{t('noTranscript')}</p>
      {canGenerateTranscript ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => {
            startOnlineASRForCurrentTrack('manual')
          }}
        >
          {t('asrGenerateSubtitles')}
        </Button>
      ) : shouldShowAsrSettingsCta ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={openAsrSettings}>
          {t('asrSetupSubtitleGeneration')}
        </Button>
      ) : null}
    </div>
  )
}
