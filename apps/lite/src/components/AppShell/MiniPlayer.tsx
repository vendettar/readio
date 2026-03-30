// src/components/AppShell/MiniPlayer.tsx

// src/components/AppShell/MiniPlayer.tsx
import { motion } from 'framer-motion'
import { ChevronDown, ChevronUp, Podcast, Volume, Volume1, Volume2, VolumeX } from 'lucide-react'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { usePlayerController } from '../../hooks/usePlayerController'
import { getDiscoveryArtworkUrl } from '../../lib/imageUtils'
import { formatTimeLabel } from '../../lib/subtitles'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../store/playerStore'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { PlaybackSpeedButton } from '../Player/controls/PlaybackSpeedButton'
import { TransportPlayPauseButton } from '../Player/controls/TransportPlayPauseButton'
import { TransportSkipButton } from '../Player/controls/TransportSkipButton'
import { Button } from '../ui/button'
import { Slider } from '../ui/slider'

// Get appropriate volume icon based on level (0-1)
function getVolumeIcon(volume: number) {
  if (volume === 0) return VolumeX
  if (volume < 0.33) return Volume
  if (volume < 0.66) return Volume1
  return Volume2
}

/**
 * Isolated progress text display
 */
const ProgressDisplay = () => {
  const progress = usePlayerStore((s) => s.progress)
  return (
    <span className="text-xs text-muted-foreground font-medium tabular-nums flex-shrink-0">
      {formatTimeLabel(progress)}
    </span>
  )
}

/**
 * Isolated remaining time display
 */
const RemainingTimeDisplay = () => {
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const remaining = Math.max(0, duration - progress)
  return (
    <span className="text-xs text-muted-foreground font-medium tabular-nums flex-shrink-0">
      -{formatTimeLabel(remaining)}
    </span>
  )
}

/**
 * Isolated progress slider
 */
const ProgressSlider = ({ isDisabled, ariaLabel }: { isDisabled: boolean; ariaLabel: string }) => {
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const seekTo = usePlayerStore((s) => s.seekTo)

  return (
    <Slider
      value={[progress]}
      min={0}
      max={duration || 100}
      step={0.1}
      onValueChange={(values) => seekTo(values[0])}
      disabled={isDisabled}
      aria-label={ariaLabel}
      className="h-1"
    />
  )
}

export function MiniPlayer() {
  const { t } = useTranslation()

  // Use atomic selectors to prevent unnecessary re-renders
  // Critical: Don't subscribe to progress/currentIndex directly at top level
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const audioTitle = usePlayerStore((s) => s.audioTitle)
  const coverArtUrl = usePlayerStore((s) => s.coverArtUrl)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const status = usePlayerStore((s) => s.status)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause)
  const volume = usePlayerStore((s) => s.volume)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const { prevSmart, nextSmart, cyclePlaybackRate } = usePlayerController()

  // Use atomic selector to avoid subscribing to entire store
  const mode = usePlayerSurfaceStore((s) => s.mode)
  const toDocked = usePlayerSurfaceStore((s) => s.toDocked)
  const toMini = usePlayerSurfaceStore((s) => s.toMini)
  const canDockedRestore = usePlayerSurfaceStore((s) => s.canDockedRestore)

  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const audioUrl = usePlayerStore((s) => s.audioUrl)

  const blobUrl = useImageObjectUrl(coverArtUrl instanceof Blob ? coverArtUrl : null)
  const effectiveCoverArtUrl =
    (typeof coverArtUrl === 'string' ? coverArtUrl : blobUrl) || undefined

  // Determine unique ID for the active item to use in layoutId
  const activeEpisodeId = episodeMetadata?.episodeId || audioUrl || 'active'

  // Hover state for capsule
  const [isHovering, setIsHovering] = useState(false)
  // Remember volume before muting for unmute restore
  const previousVolumeRef = useRef(0.8)

  // Best Practice: Distinguish between "Active Track Presence" and "Media Resource Ready"
  // Keep UI enabled when either title or source exists (some providers may have missing titles).
  const hasActiveTrack = Boolean(audioTitle || audioUrl)
  const isTransportDisabled = !hasActiveTrack

  // Toggle docked/mini mode
  const toggleDocked = () => {
    if (mode === 'docked') {
      toMini()
    } else {
      toDocked()
    }
  }

  // Toggle mute: if volume > 0, mute it; if muted, restore previous volume
  const toggleMute = () => {
    if (volume > 0) {
      previousVolumeRef.current = volume
      setVolume(0)
    } else {
      setVolume(previousVolumeRef.current || 0.8)
    }
  }

  // Volume slider uses 0-100, store uses 0-1
  const handleVolumeChange = (values: number[]) => {
    setVolume(values[0] / 100)
  }

  const volumeIcon = getVolumeIcon(volume)

  return (
    <div
      className={cn(
        'fixed bottom-0 end-0 bg-card border-t border-border z-mini-player',
        'flex items-center justify-between px-6',
        'w-shell-content h-mini-player'
      )}
    >
      {/* Left Section: Playback Speed + Controls */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Playback Speed */}
        <PlaybackSpeedButton
          playbackRate={playbackRate}
          onCycleRate={cyclePlaybackRate}
          disabled={isTransportDisabled}
          className="h-8 w-8 text-xs text-muted-foreground hover:text-foreground font-medium"
          ariaLabel={t('ariaPlaybackSpeed')}
        />

        {/* Skip Back */}
        <TransportSkipButton
          direction="back"
          onClick={prevSmart}
          disabled={isTransportDisabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          ariaLabel={t('btnPrev')}
          iconSize={16}
        />

        {/* Play/Pause */}
        <TransportPlayPauseButton
          variant="ghost"
          isPlaying={isPlaying}
          isLoading={status === 'loading'}
          onToggle={togglePlayPause}
          disabled={isTransportDisabled}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          ariaLabel={isPlaying ? t('ariaPause') : t('ariaPlay')}
          iconSize={20}
          playClassName="ms-0.5"
        />

        {/* Skip Forward */}
        <TransportSkipButton
          direction="forward"
          onClick={nextSmart}
          disabled={isTransportDisabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          ariaLabel={t('btnNext')}
          iconSize={16}
        />

        {/* TODO(miniplayer): restore Repeat entry when repeat/loop behavior is defined for mini-player. */}
        {/* <Button
          variant="ghost"
          size="icon"
          disabled={isTransportDisabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={t('ariaRepeat')}
        >
          <RotateCcw size={15} />
        </Button> */}
      </div>

      {/* Center Section: Artwork + Capsule - Premium Style */}
      <div className="flex items-center gap-3 flex-1 min-w-0 max-w-xl mx-4 sm:mx-8">
        {/* Artwork with hover overlay - Outside the capsule on the left */}
        <Button
          type="button"
          variant="ghost"
          className={cn(
            'relative flex-shrink-0 group hidden sm:block p-0 h-auto w-auto cursor-pointer',
            !canDockedRestore && 'cursor-default hover:bg-transparent'
          )}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onClick={canDockedRestore ? toggleDocked : undefined}
          disabled={!hasActiveTrack}
          aria-label={t('ariaExpandPlayer')}
        >
          {coverArtUrl ? (
            <motion.div
              layoutId={`artwork-${activeEpisodeId}-player`}
              className={cn(
                'relative w-12 h-12 rounded-md overflow-hidden bg-white shadow-md ring-1 ring-inset ring-foreground/10',
                !coverArtUrl && 'bg-card'
              )}
            >
              <img
                src={getDiscoveryArtworkUrl(effectiveCoverArtUrl, 100)}
                alt=""
                className="absolute inset-0 w-full h-full max-w-none block object-cover"
                onError={(e) => {
                  e.currentTarget.src = '/placeholder-podcast.svg'
                }}
              />
              {/* Sealer overlay */}
              <div className="absolute inset-0 rounded-md ring-1 ring-inset ring-foreground/10 pointer-events-none" />
            </motion.div>
          ) : (
            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center border border-border/10">
              <Podcast size={20} className="text-muted-foreground" />
            </div>
          )}
          {/* Hover overlay with expand button */}
          {isHovering && audioLoaded && canDockedRestore && (
            <div className="absolute inset-0 bg-foreground/15 rounded-md flex items-center justify-center transition-opacity">
              <div className="rounded-full bg-primary/95 text-primary-foreground p-1 shadow-lg ring-1 ring-primary-foreground/25">
                {mode === 'docked' ? (
                  <ChevronDown size={30} strokeWidth={2.8} />
                ) : (
                  <ChevronUp size={30} strokeWidth={2.8} />
                )}
              </div>
            </div>
          )}
        </Button>

        {/* Capsule with title, progress bar */}
        <div
          className={cn(
            'flex-1 min-w-0 h-12 relative',
            'bg-foreground/5 dark:bg-white/5 hover:bg-foreground/8 dark:hover:bg-white/10',
            'rounded-xl border border-border/30',
            'flex flex-col justify-center px-4 py-1',
            'transition-colors'
          )}
        >
          {/* Title Row with times */}
          <div className="flex items-center justify-between gap-2">
            {/* Current Time */}
            <ProgressDisplay />

            {/* Title (centered, truncate) */}
            <div className="flex-1 min-w-0 max-w-full overflow-hidden flex items-center justify-center">
              <span className="text-xs font-semibold text-foreground truncate block">
                {audioTitle || t('noTrackLoaded')}
              </span>
            </div>

            {/* Remaining Time */}
            <RemainingTimeDisplay />
          </div>

          {/* Progress Bar - thin slider at bottom */}
          <div className="mt-1">
            <ProgressSlider isDisabled={!audioLoaded} ariaLabel={t('ariaPlaybackProgress')} />
          </div>
        </div>
      </div>

      {/* Right Section: Volume + Utilities */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Volume Control */}
        <div className="hidden lg:flex items-center gap-2 me-3">
          {/* Clickable volume icon - toggles mute */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            disabled={false}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={volume > 0 ? t('ariaMute') : t('ariaUnmute')}
          >
            {React.createElement(volumeIcon, { size: 16 })}
          </Button>
          <Slider
            value={[volume * 100]}
            min={0}
            max={100}
            step={1}
            onValueChange={handleVolumeChange}
            disabled={false}
            aria-label={t('ariaVolumeSlider')}
            className="w-20 xl:w-28"
          />
        </div>

        {/* TODO(miniplayer): restore Reading Background entry when mini-player requirements are defined. */}
        {/* TODO(miniplayer): restore Open Play Queue entry when queue behavior and UX are defined. */}
      </div>
    </div>
  )
}
