// src/components/AppShell/FullPlayer.tsx

import { Minimize2, Pause, Play, Settings2, SkipBack, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useZoom } from '../../hooks/useZoom'
import { reportError } from '../../lib/errorReporter'
import { logError } from '../../lib/logger'
import { findSubtitleIndex, formatTimeLabel } from '../../lib/subtitles'
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

export function FullPlayer() {
  const { t } = useTranslation()
  const { zoomScale, showZoomBar, zoomIn, zoomOut, zoomReset, setShowZoomBar, scheduleHide } =
    useZoom()
  const [isFollowing, setIsFollowing] = useState(true)

  const {
    audioLoaded,
    audioTitle,
    coverArtUrl,
    isPlaying,
    progress,
    duration,
    togglePlayPause,
    seekTo,
    subtitles,
    subtitlesLoaded,
    currentIndex,
    setCurrentIndex,
    playbackRate,
    setPlaybackRate,
  } = usePlayerStore()

  const { exitImmersion } = useImmersionStore()

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
      <div className="fixed inset-0 z-40 bg-background flex flex-col items-center justify-center p-12 text-center">
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
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
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
        <div className="w-96 hidden xl:flex flex-col items-center justify-center p-12 bg-muted/30 border-r border-border/50">
          <div className="w-80 h-80 shadow-2xl shadow-muted/50 rounded-2xl overflow-hidden mb-10 bg-card">
            {coverArtUrl ? (
              <img src={coverArtUrl} alt="Art" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground/30">
                <span className="text-4xl font-serif">Readio</span>
              </div>
            )}
          </div>
          <div className="text-center space-y-3 max-w-xs">
            <h2 className="text-3xl font-bold text-foreground tracking-tight leading-tight">
              {audioTitle || t('untitled')}
            </h2>
          </div>
        </div>

        {/* Right (or Main): Transcript */}
        <div className="flex-1 relative overflow-hidden">
          {/* Mobile Header (only visible on small screens) */}
          <div className="xl:hidden p-8 pb-0 text-center mb-8">
            <div className="w-48 h-48 mx-auto shadow-xl rounded-xl overflow-hidden mb-6 bg-muted">
              {coverArtUrl && (
                <img src={coverArtUrl} className="w-full h-full object-cover" alt="" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-1">
              {audioTitle || t('untitled')}
            </h2>
          </div>

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
      <div className="bg-background border-t border-border px-8 py-6 z-20">
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
                {isPlaying ? (
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
    </div>
  )
}
