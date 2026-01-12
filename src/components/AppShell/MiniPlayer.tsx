// src/components/AppShell/MiniPlayer.tsx

import {
  Info,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Podcast,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
// src/components/AppShell/MiniPlayer.tsx
import React, { useRef, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { cn } from '../../lib/utils'
import { formatTimeLabel } from '../../libs/subtitles'
import { useImmersionStore } from '../../store/immersionStore'
import { usePlayerStore } from '../../store/playerStore'
import { ReadingBgControl } from '../ReadingBgControl'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Slider } from '../ui/slider'

// Get appropriate volume icon based on level (0-1)
function getVolumeIcon(volume: number) {
  if (volume === 0) return VolumeX
  if (volume < 0.33) return Volume
  if (volume < 0.66) return Volume1
  return Volume2
}

export function MiniPlayer() {
  const { t } = useI18n()
  const {
    audioLoaded,
    audioTitle,
    coverArtUrl,
    isPlaying,
    progress,
    duration,
    volume,
    setVolume,
    togglePlayPause,
    seekTo,
    subtitles,
    currentIndex,
  } = usePlayerStore()

  const { enterImmersion } = useImmersionStore()

  // Hover state for capsule
  const [isHovering, setIsHovering] = useState(false)
  // Remember volume before muting for unmute restore
  const previousVolumeRef = useRef(0.8)

  // Determine if controls should be interactive
  const isDisabled = !audioLoaded

  // Toggle mute: if volume > 0, mute it; if muted, restore previous volume
  const toggleMute = () => {
    if (volume > 0) {
      previousVolumeRef.current = volume
      setVolume(0)
    } else {
      setVolume(previousVolumeRef.current || 0.8)
    }
  }

  const handlePrev = () => {
    if (currentIndex > 0 && subtitles[currentIndex - 1]) {
      seekTo(subtitles[currentIndex - 1].start)
    } else {
      seekTo(Math.max(0, progress - 10))
    }
  }

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < subtitles.length - 1 && subtitles[currentIndex + 1]) {
      seekTo(subtitles[currentIndex + 1].start)
    } else {
      seekTo(Math.min(duration, progress + 10))
    }
  }

  // Volume slider uses 0-100, store uses 0-1
  const handleVolumeChange = (values: number[]) => {
    setVolume(values[0] / 100)
  }

  const handleProgressChange = (values: number[]) => {
    seekTo(values[0])
  }

  // Format remaining time with minus sign
  const formatRemainingTime = (current: number, total: number) => {
    const remaining = Math.max(0, total - current)
    return `-${formatTimeLabel(remaining)}`
  }

  const volumeIcon = getVolumeIcon(volume)

  return (
    <div
      className={cn(
        'fixed bottom-0 right-0 bg-card border-t border-border z-30',
        'flex items-center justify-between px-6',
        'w-[calc(100%-var(--sidebar-width))] h-[var(--mini-player-height)]',
        isDisabled && 'opacity-50'
      )}
    >
      {/* Left Section: Playback Speed + Controls */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Playback Speed */}
        <Button
          variant="ghost"
          size="icon"
          disabled={isDisabled}
          className="h-8 w-8 text-xs text-muted-foreground hover:text-foreground font-medium"
        >
          1×
        </Button>

        {/* Skip Back */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePrev}
          disabled={isDisabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={t('btnPrev')}
        >
          <SkipBack size={16} fill="currentColor" />
        </Button>

        {/* Play/Pause */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlayPause}
          disabled={isDisabled}
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={t('btnPlay')}
        >
          {isPlaying ? (
            <Pause size={20} fill="currentColor" />
          ) : (
            <Play size={20} fill="currentColor" className="ml-0.5" />
          )}
        </Button>

        {/* Skip Forward */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNext}
          disabled={isDisabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={t('btnNext')}
        >
          <SkipForward size={16} fill="currentColor" />
        </Button>

        {/* Repeat/Loop */}
        <Button
          variant="ghost"
          size="icon"
          disabled={isDisabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={t('ariaRepeat')}
        >
          <RotateCcw size={15} />
        </Button>
      </div>

      {/* Center Section: Artwork + Capsule - Premium Style */}
      <div className="flex items-center gap-3 flex-1 min-w-0 max-w-xl mx-4 sm:mx-8">
        {/* Artwork with hover overlay - Outside the capsule on the left */}
        <Button
          type="button"
          variant="ghost"
          className="relative flex-shrink-0 group hidden sm:block p-0 h-auto w-auto cursor-pointer"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onClick={audioLoaded ? enterImmersion : undefined}
          disabled={!audioLoaded}
          aria-label={t('ariaExpandPlayer')}
        >
          {coverArtUrl ? (
            <img
              src={coverArtUrl}
              alt=""
              className="w-12 h-12 rounded-md object-cover shadow-sm bg-muted"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
              <Podcast size={20} className="text-muted-foreground" />
            </div>
          )}
          {/* Hover overlay with expand button */}
          {isHovering && audioLoaded && (
            <div className="absolute inset-0 bg-foreground/50 rounded-md flex items-center justify-center transition-opacity">
              <Maximize2 size={20} className="text-background" />
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
            <span className="text-xs text-muted-foreground font-medium tabular-nums flex-shrink-0">
              {formatTimeLabel(progress)}
            </span>

            {/* Title (centered, truncate) */}
            <div className="flex-1 min-w-0 max-w-full overflow-hidden text-center">
              <span className="text-sm font-semibold text-foreground truncate block">
                {audioTitle || t('noTrackLoaded')}
              </span>
            </div>

            {/* Remaining Time */}
            <span className="text-xs text-muted-foreground font-medium tabular-nums flex-shrink-0">
              {formatRemainingTime(progress, duration)}
            </span>
          </div>

          {/* Progress Bar - thin slider at bottom */}
          <div className="mt-1">
            <Slider
              value={[progress]}
              min={0}
              max={duration || 100}
              step={0.1}
              onValueChange={handleProgressChange}
              disabled={isDisabled}
              className="h-1"
            />
          </div>
        </div>
      </div>

      {/* Right Section: Volume + Utilities */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Volume Control */}
        <div className="hidden lg:flex items-center gap-2 mr-3">
          {/* Clickable volume icon - toggles mute */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            disabled={isDisabled}
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
            disabled={isDisabled}
            className="w-20 xl:w-28"
          />
        </div>

        {/* Info / Settings */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={isDisabled}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label={t('ariaSettings')}
            >
              <Info size={18} />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end">
            <ReadingBgControl />
          </PopoverContent>
        </Popover>

        {/* Queue / Expand */}
        <Button
          variant="ghost"
          size="icon"
          onClick={enterImmersion}
          disabled={isDisabled}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label={t('miniPlayerExpand')}
        >
          <ListMusic size={18} />
        </Button>
      </div>
    </div>
  )
}
