import { motion } from 'framer-motion'
import { Loader2, Minimize2, Pause, Play, Settings2, SkipBack, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { usePageVisibility } from '../../hooks/usePageVisibility'
import { usePlayerGestures } from '../../hooks/usePlayerGestures'
import { useZoom } from '../../hooks/useZoom'
import { reportError } from '../../lib/errorReporter'
import { logError } from '../../lib/logger'
import { findSubtitleIndex, formatTimeLabel } from '../../lib/subtitles'
import { cn } from '../../lib/utils'
import { useImmersionStore } from '../../store/immersionStore'
import { usePlayerStore } from '../../store/playerStore'
import { ErrorBoundary } from '../ErrorBoundary'
import { FollowButton } from '../FollowButton'
import { ReadingBgControl } from '../ReadingBgControl'
import { TranscriptView } from '../Transcript'
import { TranscriptErrorFallback } from '../Transcript/TranscriptErrorFallback'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Slider } from '../ui/slider'
import { ZoomControl } from '../ZoomControl'
import styles from './FullPlayer.module.css'

export function FullPlayer() {
  const { t } = useTranslation()
  const { zoomScale, showZoomBar, zoomIn, zoomOut, zoomReset, setShowZoomBar, scheduleHide } =
    useZoom()
  const [isFollowing, setIsFollowing] = useState(true)
  const isDesktop = useMediaQuery('(min-width: 1280px)')
  const isVisible = usePageVisibility()

  // Use atomic selectors to prevent unnecessary re-renders from progress updates
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const audioTitle = usePlayerStore((s) => s.audioTitle)
  const coverArtUrl = usePlayerStore((s) => s.coverArtUrl)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const status = usePlayerStore((s) => s.status)
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const subtitles = usePlayerStore((s) => s.subtitles)
  const subtitlesLoaded = usePlayerStore((s) => s.subtitlesLoaded)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const playbackRate = usePlayerStore((s) => s.playbackRate)

  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const setCurrentIndex = usePlayerStore((s) => s.setCurrentIndex)
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate)

  const exitImmersion = useImmersionStore((s) => s.exitImmersion)
  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const audioUrl = usePlayerStore((s) => s.audioUrl)

  const blobUrl = useImageObjectUrl(coverArtUrl instanceof Blob ? coverArtUrl : null)
  const effectiveCoverArtUrl = typeof coverArtUrl === 'string' ? coverArtUrl : blobUrl

  // Determine unique ID for the active item to use in layoutId
  const activeEpisodeId = episodeMetadata?.episodeId || audioUrl || 'active'

  const { bind, y } = usePlayerGestures()

  // Find current subtitle using optimized algorithm
  useEffect(() => {
    if (subtitles.length === 0) return

    const idx = findSubtitleIndex(subtitles, progress, currentIndex)
    if (idx !== -1 && idx !== currentIndex) {
      setCurrentIndex(idx)
    }
  }, [progress, subtitles, currentIndex, setCurrentIndex])

  // Skip backward 10 seconds
  const handleSkipBack = useCallback(() => {
    seekTo(Math.max(0, progress - 10))
  }, [seekTo, progress])

  // Skip forward 10 seconds
  const handleSkipForward = useCallback(() => {
    seekTo(Math.min(duration, progress + 10))
  }, [seekTo, progress, duration])

  const handleJumpToSubtitle = useCallback(
    (index: number) => {
      if (subtitles[index]) {
        seekTo(subtitles[index].start)
      }
    },
    [seekTo, subtitles]
  )

  const handleSeek = (values: number[]) => {
    seekTo(values[0])
  }

  const handleFollowClick = useCallback(() => {
    setIsFollowing(true)
  }, [])

  // Cycle through playback rates
  const handlePlaybackRateClick = useCallback(() => {
    const rates = [0.8, 1.0, 1.25, 1.5, 2.0]
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length
    setPlaybackRate(rates[nextIdx])
  }, [playbackRate, setPlaybackRate])

  const showFollowButton = !isFollowing && subtitlesLoaded

  // If no audio loaded, show placeholder
  if (!audioLoaded) {
    return (
      <div className="fixed inset-0 z-full-player bg-background flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">{t('playerNotPlaying')}</h2>
        <p className="text-muted-foreground mb-6">{t('playerSelectTrack')}</p>
        <Button
          variant="secondary"
          onClick={exitImmersion}
          className="gap-2"
          aria-label={t('ariaMinimize')}
        >
          <Minimize2 size={18} />
          {t('minimize')}
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      onPointerDown={bind().onPointerDown}
      onPointerMove={bind().onPointerMove}
      onPointerUp={bind().onPointerUp}
      onPointerCancel={bind().onPointerCancel}
      onKeyDown={bind().onKeyDown}
      onKeyUp={bind().onKeyUp}
      initial={{ y: '100%' }}
      animate={isVisible ? { y: y } : false}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 1 }}
      className={cn(
        'fixed inset-0 z-full-player bg-background/95 backdrop-blur-3xl flex flex-col will-change-transform touch-none'
      )}
      data-dragging={y > 0}
      data-hidden={!isVisible}
    >
      <motion.div
        className="absolute inset-0 bg-background/80 -z-10"
        initial={{ opacity: 0 }}
        animate={isVisible ? { opacity: 1 } : false}
        exit={{ opacity: 0 }}
      />
      {/* Drag Handle for swipe-down to close */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-muted-foreground/20 rounded-full z-50 pointer-events-none" />

      {/* Minimize Button */}
      <div className="absolute top-4 right-4 z-50">
        <Button
          variant="ghost"
          size="icon"
          onClick={exitImmersion}
          className="bg-background/80 backdrop-blur-sm shadow-sm"
          aria-label={t('ariaMinimize')}
        >
          <Minimize2 size={20} />
        </Button>
      </div>

      {/* Content Area: Split View for Desktop */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Artwork & Info (Fixed side on desktop) */}
        {isDesktop && (
          <div className="w-96 hidden xl:flex flex-col items-center justify-center p-12 bg-muted/30 border-r border-border/50">
            <div className="relative mb-10">
              {/* Standard Soft outer glow */}
              <div className="absolute inset-2 shadow-2xl shadow-black/20 rounded-2xl pointer-events-none" />

              <motion.div
                layoutId={isDesktop ? `artwork-${activeEpisodeId}-player` : undefined}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                animate={isVisible ? undefined : false}
                className={cn(
                  'relative w-80 h-80 rounded-2xl overflow-hidden bg-white transition-shadow duration-500',
                  'ring-1 ring-white/10 ring-inset',
                  !coverArtUrl && 'bg-card'
                )}
              >
                {coverArtUrl ? (
                  <>
                    <img
                      src={effectiveCoverArtUrl || undefined}
                      alt="Art"
                      className="absolute inset-[-4px] w-[calc(100%+8px)] h-[calc(100%+8px)] max-w-none block object-cover"
                    />
                    {/* The 'Sealer': Standardized ring-inset overlay */}
                    <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white pointer-events-none" />
                  </>
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground/30">
                    <span className="text-4xl font-serif">Readio</span>
                  </div>
                )}
              </motion.div>
            </div>
            <div className="text-center space-y-3 max-w-xs">
              <h2 className="text-3xl font-bold text-foreground tracking-tight leading-tight">
                {audioTitle || t('untitled')}
              </h2>
            </div>
          </div>
        )}

        {/* Right (or Main): Transcript */}
        <div className="flex-1 relative overflow-hidden pb-player-footer">
          {/* Mobile Header (only visible on small screens) */}
          {!isDesktop && (
            <div className="xl:hidden p-8 pb-0 text-center mb-8">
              <div className="relative mb-6">
                <div className="absolute inset-1 shadow-lg shadow-black/10 rounded-xl pointer-events-none" />
                <motion.div
                  layoutId={!isDesktop ? `artwork-${activeEpisodeId}-player` : undefined}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  animate={isVisible ? undefined : false}
                  className={cn(
                    'relative w-48 h-48 mx-auto rounded-xl overflow-hidden bg-white ring-1 ring-inset ring-white',
                    !coverArtUrl && 'bg-muted'
                  )}
                >
                  {coverArtUrl && (
                    <>
                      <img
                        src={effectiveCoverArtUrl || undefined}
                        className="absolute inset-[-4px] w-[calc(100%+8px)] h-[calc(100%+8px)] max-w-none block object-cover"
                        alt=""
                      />
                      {/* Defensive white sealer */}
                      <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white pointer-events-none" />
                    </>
                  )}
                </motion.div>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-1">
                {audioTitle || t('untitled')}
              </h2>
            </div>
          )}

          {subtitlesLoaded ? (
            <ErrorBoundary
              fallback={({ error, reset }) => (
                <TranscriptErrorFallback error={error} reset={reset} />
              )}
              onError={(error, info) => {
                logError('[FullPlayer TranscriptView]', error, info)
                reportError(error, info)
              }}
            >
              <TranscriptView
                subtitles={subtitles}
                currentIndex={currentIndex}
                onJumpToSubtitle={handleJumpToSubtitle}
                isFollowing={isFollowing}
                onFollowingChange={setIsFollowing}
                zoomScale={zoomScale}
              />
            </ErrorBoundary>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center opacity-60">
              <div className="w-16 h-16 mb-6 rounded-full bg-muted flex items-center justify-center">
                <span className="text-2xl grayscale opacity-50">📖</span>
              </div>
              <p className="text-xl font-serif text-muted-foreground mb-2">{t('noTranscript')}</p>
              <p className="text-sm text-muted-foreground">{t('pureListeningMode')}</p>
            </div>
          )}

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

          <FollowButton
            isPlaying={isPlaying}
            isVisible={showFollowButton}
            onClick={handleFollowClick}
          />
        </div>
      </div>

      {/* Player Controls Footer */}
      <div className="absolute bottom-0 left-0 right-0 bg-background/60 backdrop-blur-xl backdrop-saturate-150 border-t border-border/50 px-8 py-6 z-20">
        <div className="max-w-4xl mx-auto">
          {/* Seek Bar */}
          <div className="flex items-center gap-4 mb-6 group">
            <span className="text-xs text-muted-foreground tabular-nums w-12 text-right font-medium">
              {formatTimeLabel(progress)}
            </span>
            <div className="flex-1 relative h-5 flex items-center cursor-pointer">
              <Slider
                value={[progress]}
                min={0}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="w-full cursor-pointer"
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-12 font-medium">
              {formatTimeLabel(duration)}
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-between">
            {/* Left: Playback Speed */}
            <div className="w-1/3 flex items-center justify-start">
              <Button
                variant="ghost"
                onClick={handlePlaybackRateClick}
                className="text-xs font-bold tracking-widest uppercase"
              >
                {playbackRate}x
              </Button>
            </div>

            {/* Center: Playback Controls */}
            <div className="flex items-center gap-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipBack}
                className="h-12 w-12"
                aria-label={t('skipBack10s')}
                title={t('skipBack10s')}
              >
                <SkipBack size={28} strokeWidth={1} />
              </Button>
              <Button
                size="icon"
                onClick={togglePlayPause}
                className="w-16 h-16 rounded-full shadow-xl shadow-muted/50"
              >
                {status === 'loading' ? (
                  <Loader2
                    size={28}
                    className={cn('animate-spin', styles.animationPaused)}
                    data-hidden={!isVisible}
                  />
                ) : isPlaying ? (
                  <Pause size={28} fill="currentColor" />
                ) : (
                  <Play size={28} fill="currentColor" className="ml-1" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSkipForward}
                className="h-12 w-12"
                aria-label={t('skipForward10s')}
                title={t('skipForward10s')}
              >
                <SkipForward size={28} strokeWidth={1} />
              </Button>
            </div>

            {/* Right: Settings */}
            <div className="w-1/3 flex items-center justify-end">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Settings2 size={20} strokeWidth={1.5} />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="top" align="end">
                  <ReadingBgControl />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
