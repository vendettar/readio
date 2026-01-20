import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { FollowButton } from '../components/FollowButton'
import { TranscriptErrorFallback } from '../components/Transcript/TranscriptErrorFallback'
import { Button } from '../components/ui/button'
import { ZoomControl } from '../components/ZoomControl'
import { useI18n } from '../hooks/useI18n'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useZoom } from '../hooks/useZoom'
import { reportError } from '../lib/errorReporter'
import { logError } from '../lib/logger'
import { findSubtitleIndex } from '../lib/subtitles'
import { usePlayerStore } from '../store/playerStore'

const LazyTranscriptView = lazy(() =>
  import('../components/Transcript/TranscriptView').then((mod) => ({ default: mod.TranscriptView }))
)

function HomePage() {
  const router = useRouter()
  const { t } = useI18n()
  const { zoomScale, showZoomBar, zoomIn, zoomOut, zoomReset, setShowZoomBar, scheduleHide } =
    useZoom()
  const [isFollowing, setIsFollowing] = useState(true)

  // Keyboard shortcuts active on home page
  useKeyboardShortcuts({ isModalOpen: false })

  const {
    audioUrl,
    audioLoaded,
    subtitles,
    subtitlesLoaded,
    currentIndex,
    setCurrentIndex,
    progress,
    isPlaying,
    seekTo,
    initializationStatus,
  } = usePlayerStore()

  // Find current subtitle using optimized algorithm
  useEffect(() => {
    if (subtitles.length === 0) return

    const idx = findSubtitleIndex(subtitles, progress, currentIndex)
    if (idx !== -1 && idx !== currentIndex) {
      setCurrentIndex(idx)
    }
  }, [progress, subtitles, currentIndex, setCurrentIndex])

  const handleJumpToSubtitle = useCallback(
    (index: number) => {
      if (subtitles[index]) {
        seekTo(subtitles[index].start)
      }
    },
    [seekTo, subtitles]
  )

  const handleFollowClick = useCallback(() => {
    setIsFollowing(true)
  }, [])

  const showFollowButton = !isFollowing && subtitlesLoaded

  // Check if we should redirect to files
  // Only redirect if:
  // 1. No audio/subtitles loaded AND
  // 2. No session exists (meaning user hasn't started any playback yet)
  useEffect(() => {
    if (
      !audioUrl &&
      !subtitlesLoaded &&
      (initializationStatus === 'ready' || initializationStatus === 'failed')
    ) {
      router.navigate({ to: '/files', replace: true })
    }
  }, [audioUrl, subtitlesLoaded, initializationStatus, router])

  // Content loaded - show transcript
  return (
    <div className="h-full relative">
      {subtitlesLoaded && (
        <ZoomControl
          zoomScale={zoomScale}
          isVisible={showZoomBar}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onZoomReset={zoomReset}
          onMouseEnter={() => setShowZoomBar(true)}
          onMouseLeave={scheduleHide}
        />
      )}

      <ErrorBoundary
        fallback={({ error, reset }) => <TranscriptErrorFallback error={error} reset={reset} />}
        onError={(error, info) => {
          logError('[TranscriptView]', error, info)
          reportError(error, info)
        }}
      >
        {subtitlesLoaded ? (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-muted/30 animate-shimmer" />
              </div>
            }
          >
            <LazyTranscriptView
              subtitles={subtitles}
              currentIndex={currentIndex}
              onJumpToSubtitle={handleJumpToSubtitle}
              isFollowing={isFollowing}
              onFollowingChange={setIsFollowing}
              zoomScale={zoomScale}
            />
          </Suspense>
        ) : audioLoaded ? (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-60">
            <div className="w-16 h-16 mb-6 rounded-full bg-muted flex items-center justify-center">
              <span className="text-2xl grayscale opacity-50">📖</span>
            </div>
            <p className="text-lg font-bold text-foreground tracking-tight mb-2">
              {t('homeNoSubtitles')}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              {t('homeNoSubtitlesDesc')}
            </p>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-60">
            <div className="w-16 h-16 mb-6 rounded-full bg-muted flex items-center justify-center">
              <span className="text-2xl grayscale opacity-50">🔄</span>
            </div>
            <p className="text-lg font-bold text-foreground tracking-tight mb-2">
              {t('homeSessionFound')}
            </p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-4">
              {t('homeSessionInterrupted')}
            </p>
            <Button asChild className="rounded-lg">
              <Link to="/files">{t('homeContinueUpload')}</Link>
            </Button>
          </div>
        )}
      </ErrorBoundary>

      <FollowButton
        isPlaying={isPlaying}
        isVisible={showFollowButton}
        onClick={handleFollowClick}
      />
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
