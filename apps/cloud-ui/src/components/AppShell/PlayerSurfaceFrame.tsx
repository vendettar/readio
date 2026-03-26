import { motion } from 'framer-motion'
import { ChevronDown, Minimize2, Settings2 } from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { usePageVisibility } from '../../hooks/usePageVisibility'
import { usePlayerController } from '../../hooks/usePlayerController'
import { warn } from '../../lib/logger'
import {
  createReadingContentTransitionSample,
  isReadingContentTransitionOverBudget,
} from '../../lib/perf/readingContentPerf'
import { formatTimeLabel } from '../../lib/subtitles'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../store/playerStore'
import type { SurfaceMode } from '../../store/playerSurfaceStore'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { FollowButton } from '../FollowButton'
import { PlaybackSpeedButton } from '../Player/controls/PlaybackSpeedButton'
import { TransportPlayPauseButton } from '../Player/controls/TransportPlayPauseButton'
import { TransportSkipButton } from '../Player/controls/TransportSkipButton'
import { DownloadedBadge, PlayerDownloadAction } from '../Player/PlayerDownloadAction'
import { ShareButton } from '../Player/ShareButton'
import { SleepTimerButton } from '../Player/SleepTimerButton'
import { ReadingBgControl } from '../ReadingBgControl'
import { Button } from '../ui/button'

import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Slider } from '../ui/slider'
import styles from './FullPlayer.module.css'
import { ReadingContent } from './ReadingContent'

/** Shared layout identity for surface morph animation */
export const PLAYER_SURFACE_LAYOUT_ID = 'player-surface-frame'
const FULL_PLAYER_TITLE_ID = 'full-player-title'

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
const PLAYER_OWNED_OVERLAY_ATTR = 'data-player-overlay-owned'

function isWithinPlayerOwnedOverlay(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest(`[${PLAYER_OWNED_OVERLAY_ATTR}="true"]`)
}

/**
 * Isolated seek bar and time labels (only used in full mode)
 */
const FullPlayerSeekBar = ({ ariaLabel }: { ariaLabel: string }) => {
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const seekTo = usePlayerStore((s) => s.seekTo)

  return (
    <div className="flex items-center gap-4 mb-6 group">
      <span className="text-xs text-muted-foreground tabular-nums w-12 text-start font-medium">
        {formatTimeLabel(progress)}
      </span>
      <div className="flex-1 relative h-5 flex items-center cursor-pointer">
        <Slider
          value={[progress]}
          min={0}
          max={duration || 100}
          step={0.1}
          onValueChange={(values) => seekTo(values[0])}
          aria-label={ariaLabel}
          className="w-full cursor-pointer"
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-12 font-medium">
        {formatTimeLabel(duration)}
      </span>
    </div>
  )
}

/**
 * Unified player surface frame that morphs between docked and full modes.
 * One frame stays mounted across transitions — no dual-surface swap.
 */
export function PlayerSurfaceFrame({ mode }: { mode: Exclude<SurfaceMode, 'mini'> }) {
  const { t } = useTranslation()
  const isDocked = mode === 'docked'
  const isFull = mode === 'full'
  const frameRef = useRef<HTMLDivElement | null>(null)
  const fullMinimizeButtonRef = useRef<HTMLButtonElement | null>(null)
  const dockedMinimizeButtonRef = useRef<HTMLButtonElement | null>(null)
  const fullOpenTriggerRef = useRef<{
    type: 'docked-expand'
    element: HTMLElement | null
  } | null>(null)
  const previousFocusedElementRef = useRef<HTMLElement | null>(null)
  const inertSiblingsRef = useRef<
    Array<{ el: HTMLElement; prevAriaHidden: string | null; hadInert: boolean }>
  >([])

  // Surface store actions
  const toMini = usePlayerSurfaceStore((s) => s.toMini)
  const toDocked = usePlayerSurfaceStore((s) => s.toDocked)
  const canDockedRestore = usePlayerSurfaceStore((s) => s.canDockedRestore)

  // Player state
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const audioTitle = usePlayerStore((s) => s.audioTitle)
  const coverArtUrl = usePlayerStore((s) => s.coverArtUrl)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const status = usePlayerStore((s) => s.status)
  const subtitlesLoaded = useTranscriptStore((s) => s.subtitlesLoaded)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const {
    togglePlayPause,
    prevSmart: handleSkipBack,
    nextSmart: handleSkipForward,
    cyclePlaybackRate: handlePlaybackRateClick,
  } = usePlayerController()

  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const audioUrl = usePlayerStore((s) => s.audioUrl)
  // Mode-based active flags
  const hasActiveTrack = Boolean(audioTitle || audioUrl)

  const isDesktop = useMediaQuery('(min-width: 1280px)')
  const isVisible = usePageVisibility()

  const blobUrl = useImageObjectUrl(coverArtUrl instanceof Blob ? coverArtUrl : null)
  const effectiveCoverArtUrl = typeof coverArtUrl === 'string' ? coverArtUrl : blobUrl

  const activeEpisodeId = episodeMetadata?.episodeId || audioUrl || 'active'

  // Shared state: transcript auto-scrolling (replaces the old isFollowing in ReadingContent)
  // Moving it up allows FollowButton (rendered in PlayerSurfaceFrame) to react to it.
  const [isAutoScrolling, setIsAutoScrolling] = useState(true)
  const [isPlayerSettingsOpen, setIsPlayerSettingsOpen] = useState(false)
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false)
  // Keep this as the single frame-level gate for nested player-owned overlay Escape deferral.
  const hasActivePlayerOwnedOverlay = isPlayerSettingsOpen || isSleepTimerOpen
  const showFollowButton = !isAutoScrolling && subtitlesLoaded && isFull
  const previousModeRef = useRef<typeof mode>(mode)

  // Exit handler
  const handleExit = useCallback(() => {
    if (canDockedRestore) {
      toDocked()
    } else {
      toMini()
    }
  }, [canDockedRestore, toDocked, toMini])

  const handleFollowClick = useCallback(() => {
    setIsAutoScrolling(true)
  }, [])

  // TODO(player-surface): restore docked "Full Mode" entry when the product contract is defined again.
  // const handleExpandToFull = useCallback(
  //   (event: React.MouseEvent<HTMLButtonElement>) => {
  //     fullOpenTriggerRef.current = {
  //       type: 'docked-expand',
  //       element: event.currentTarget,
  //     }
  //     toFull()
  //   },
  //   [toFull]
  // )

  useEffect(() => {
    const previousMode = previousModeRef.current
    previousModeRef.current = mode
    if (previousMode === mode) return

    const startedAt = performance.now()
    let raf1 = 0
    let raf2 = 0

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const durationMs = performance.now() - startedAt
        const sample = createReadingContentTransitionSample({
          fromMode: previousMode,
          toMode: mode,
          durationMs,
        })
        if (import.meta.env.DEV && isReadingContentTransitionOverBudget(sample.durationMs)) {
          warn('[ReadingContentPerf] transition_over_budget', sample)
        }
      })
    })

    return () => {
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [mode])

  useEffect(() => {
    if (!isFull) return

    const root = frameRef.current
    if (!root) return

    const active = document.activeElement
    if (active instanceof HTMLElement && !root.contains(active)) {
      previousFocusedElementRef.current = active
    }

    // Modal full player: temporarily hide siblings from assistive tech and sequential focus.
    const parent = root.parentElement
    if (parent) {
      const tracked: Array<{ el: HTMLElement; prevAriaHidden: string | null; hadInert: boolean }> =
        []
      Array.from(parent.children).forEach((child) => {
        if (child === root || !(child instanceof HTMLElement)) return
        tracked.push({
          el: child,
          prevAriaHidden: child.getAttribute('aria-hidden'),
          hadInert: child.hasAttribute('inert'),
        })
        child.setAttribute('aria-hidden', 'true')
        child.setAttribute('inert', '')
      })
      inertSiblingsRef.current = tracked
    }

    const raf = requestAnimationFrame(() => {
      const preferredFocusTarget = fullMinimizeButtonRef.current
      if (preferredFocusTarget) {
        preferredFocusTarget.focus()
        return
      }
      const fallbackFocusable = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      fallbackFocusable?.focus()
    })

    return () => {
      cancelAnimationFrame(raf)
      inertSiblingsRef.current.forEach(({ el, prevAriaHidden, hadInert }) => {
        if (prevAriaHidden === null) {
          el.removeAttribute('aria-hidden')
        } else {
          el.setAttribute('aria-hidden', prevAriaHidden)
        }
        if (!hadInert) {
          el.removeAttribute('inert')
        }
      })
      inertSiblingsRef.current = []

      // Restore focus when leaving full mode.
      requestAnimationFrame(() => {
        if (fullOpenTriggerRef.current?.type === 'docked-expand') {
          const { element } = fullOpenTriggerRef.current
          fullOpenTriggerRef.current = null
          if (element && document.body.contains(element)) {
            element.focus()
            return
          }
          const remountedTrigger = document.querySelector(
            '[data-player-full-open-trigger="docked-expand"]'
          ) as HTMLElement | null
          if (remountedTrigger) {
            remountedTrigger.focus()
            return
          }
        }

        if (
          previousFocusedElementRef.current &&
          document.body.contains(previousFocusedElementRef.current)
        ) {
          previousFocusedElementRef.current.focus()
          return
        }
        if (
          dockedMinimizeButtonRef.current &&
          document.body.contains(dockedMinimizeButtonRef.current)
        ) {
          dockedMinimizeButtonRef.current.focus()
          return
        }
        const sidebarFallback = document.querySelector(
          'aside button, aside a'
        ) as HTMLElement | null
        sidebarFallback?.focus()
      })
    }
  }, [isFull])

  const handleFrameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isFull) return
      if (event.key === 'Escape') {
        if (
          event.defaultPrevented ||
          hasActivePlayerOwnedOverlay ||
          isWithinPlayerOwnedOverlay(event.target)
        ) {
          return
        }
        event.preventDefault()
        handleExit()
        return
      }
      if (event.key !== 'Tab') return

      const root = frameRef.current
      if (!root) return
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
      )
      if (!focusable.length) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null
      const isActiveInside = !!active && root.contains(active)
      if (event.shiftKey) {
        if (!isActiveInside || active === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }
      if (!isActiveInside || active === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [handleExit, hasActivePlayerOwnedOverlay, isFull]
  )

  return (
    <motion.div
      ref={frameRef}
      layout
      layoutId={PLAYER_SURFACE_LAYOUT_ID}
      initial={
        isFull
          ? { opacity: 0 }
          : {
              y: '100%',
              opacity: 0,
              top: 0,
              left: 'var(--sidebar-width)',
              right: 0,
              bottom: 'var(--mini-player-height)',
            }
      }
      animate={
        isFull
          ? {
              y: 0,
              opacity: isVisible ? 1 : 0.7,
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 'var(--z-full-player)',
            }
          : {
              y: 0,
              opacity: 1,
              left: isDocked ? 'var(--sidebar-width)' : 0,
              bottom: isDocked ? 'var(--mini-player-height)' : 0,
              right: 0,
              top: 0,
              zIndex: 'var(--z-docked-player)',
            }
      }
      exit={isFull ? { opacity: 0 } : { y: '100%', opacity: 0 }}
      transition={{
        type: 'spring',
        damping: 34,
        stiffness: 240,
        mass: 1,
      }}
      className={cn(
        'flex flex-col will-change-transform bg-background overflow-hidden',
        isFull
          ? 'fixed inset-0 h-full w-full bg-background' // Full screen (Opaque for stability)
          : 'fixed backdrop-blur-md bg-background/95 border shadow-2xl pointer-events-auto' // Docked (Glassy)
      )}
      data-mode={mode}
      data-hidden={!isVisible}
      data-testid="player-surface-frame"
      role={isFull ? 'dialog' : undefined}
      aria-modal={isFull ? 'true' : undefined}
      aria-labelledby={isFull ? FULL_PLAYER_TITLE_ID : undefined}
      onKeyDown={handleFrameKeyDown}
    >
      {isFull && (
        <h2 id={FULL_PLAYER_TITLE_ID} className="sr-only">
          {audioTitle || t('untitled')}
        </h2>
      )}
      {/* 1. Mode-Specific Header/Buttons */}
      {isDocked ? (
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-background/95 backdrop-blur-md z-10 flex-shrink-0">
          <h3 className="font-semibold text-lg truncate max-w-[80%]">
            {audioTitle || t('untitled')}
          </h3>
          <div className="flex items-center gap-1">
            {/* TODO(player-surface): restore the docked "Full Mode" button when the follow-up UX is re-approved. */}
            {/* {canOpenFullFromDocked && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExpandToFull}
                data-player-full-open-trigger="docked-expand"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label={t('ariaOpenQueue')}
              >
                <Maximize2 size={20} />
              </Button>
            )} */}
            <Button
              ref={dockedMinimizeButtonRef}
              variant="ghost"
              size="icon"
              onClick={toMini}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label={t('ariaMinimize')}
            >
              <ChevronDown size={24} />
            </Button>
          </div>
        </div>
      ) : (
        hasActiveTrack && (
          <div className="absolute top-6 end-10 z-full-player pointer-events-auto">
            <Button
              ref={fullMinimizeButtonRef}
              variant="ghost"
              size="icon"
              onClick={handleExit}
              className="bg-background/80 backdrop-blur-sm shadow-sm"
              aria-label={t('ariaMinimize')}
            >
              <Minimize2 size={20} />
            </Button>
          </div>
        )
      )}

      {/* 2. Central Content Area (Persistent ReadingContent) */}
      <div className="flex-1 flex overflow-hidden relative pointer-events-auto">
        {/* Full mode desktop artwork */}
        {isFull && hasActiveTrack && isDesktop && (
          <div className="w-96 hidden xl:flex flex-col items-center justify-center p-12 bg-muted/30 border-e border-border/50">
            <div className="relative mb-10">
              <div className="absolute inset-2 shadow-2xl shadow-black/20 rounded-2xl pointer-events-none" />
              <motion.div
                layoutId={isDesktop ? `artwork-${activeEpisodeId}-player` : undefined}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                animate={isVisible ? undefined : false}
                className={cn(
                  'relative w-80 h-80 rounded-2xl overflow-hidden bg-white transition-shadow duration-500',
                  'ring-1 ring-inset ring-foreground/10',
                  !coverArtUrl && 'bg-card'
                )}
              >
                {coverArtUrl ? (
                  <>
                    <img
                      src={effectiveCoverArtUrl || undefined}
                      alt="Art"
                      className="absolute inset-0 w-full h-full max-w-none block object-cover"
                    />
                    <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-foreground/10 pointer-events-none" />
                  </>
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground/30">
                    <span className="text-4xl font-serif">Readio</span>
                  </div>
                )}
              </motion.div>
            </div>
            <div className="text-center space-y-3 max-w-xs flex flex-col items-center">
              <div className="flex items-center gap-2 justify-center w-full">
                <h2 className="text-3xl font-bold text-foreground tracking-tight leading-tight truncate">
                  {audioTitle || t('untitled')}
                </h2>
                <DownloadedBadge audioUrl={audioUrl} className="flex-shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* Main Transcript/Content Column */}
        <div
          className={cn(
            'flex-1 relative overflow-hidden flex flex-col',
            isFull && hasActiveTrack && 'pb-player-footer'
          )}
        >
          {/* Full mode NO active identity placeholder */}
          {isFull && !hasActiveTrack ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">{t('playerNotPlaying')}</h2>
              <p className="text-muted-foreground mb-6">{t('playerSelectTrack')}</p>
              <Button
                ref={fullMinimizeButtonRef}
                variant="secondary"
                onClick={handleExit}
                className="gap-2"
                aria-label={t('ariaMinimize')}
              >
                <Minimize2 size={18} />
                {t('minimize')}
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile Header (Full mode only) */}
              {isFull && !isDesktop && (
                <div className="xl:hidden p-8 pb-0 text-center mb-8">
                  <div className="relative mb-6">
                    <div className="absolute inset-1 shadow-lg shadow-black/10 rounded-xl pointer-events-none" />
                    <motion.div
                      layoutId={!isDesktop ? `artwork-${activeEpisodeId}-player` : undefined}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      animate={isVisible ? undefined : false}
                      className={cn(
                        'relative w-48 h-48 mx-auto rounded-xl overflow-hidden bg-white ring-1 ring-inset ring-foreground/10',
                        !coverArtUrl && 'bg-muted'
                      )}
                    >
                      {coverArtUrl && (
                        <>
                          <img
                            src={effectiveCoverArtUrl || undefined}
                            className="absolute inset-0 w-full h-full max-w-none block object-cover"
                            alt=""
                          />
                          <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-foreground/10 pointer-events-none" />
                        </>
                      )}
                    </motion.div>
                  </div>
                  <div className="flex items-center gap-2 justify-center mb-1">
                    <h2 className="text-2xl font-bold text-foreground truncate max-w-[85%]">
                      {audioTitle || t('untitled')}
                    </h2>
                    <DownloadedBadge audioUrl={audioUrl} className="flex-shrink-0" />
                  </div>
                </div>
              )}

              {/* PERSISTENT ReadingContent Instance */}
              <ReadingContent
                variant={mode}
                isAutoScrolling={isAutoScrolling}
                setIsAutoScrolling={setIsAutoScrolling}
              />

              {/* Follow Button (Full mode only) */}
              {isFull && (
                <FollowButton
                  isPlaying={isPlaying}
                  isVisible={showFollowButton}
                  onClick={handleFollowClick}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* 3. Full Player Controls Footer */}
      {isFull && hasActiveTrack && (
        <div className="absolute bottom-0 start-0 end-0 bg-background/60 backdrop-blur-xl backdrop-saturate-150 border-t border-border/50 px-8 py-6 pointer-events-auto">
          <div className="max-w-4xl mx-auto">
            <FullPlayerSeekBar ariaLabel={t('ariaPlaybackProgress')} />
            <div className="flex items-center justify-between">
              {/* Left: Playback Speed */}
              <div className="w-1/3 flex items-center justify-start">
                <PlaybackSpeedButton
                  playbackRate={playbackRate}
                  onCycleRate={handlePlaybackRateClick}
                  className="text-xs font-bold tracking-widest uppercase"
                  ariaLabel={t('ariaPlaybackSpeed')}
                />
              </div>

              {/* Center: Playback Controls */}
              <div className="flex items-center gap-10">
                <TransportSkipButton
                  direction="back"
                  onClick={handleSkipBack}
                  className="h-12 w-12"
                  ariaLabel={t('skipBack10s')}
                  title={t('skipBack10s')}
                  iconSize={28}
                  iconStrokeWidth={1}
                />
                <TransportPlayPauseButton
                  isPlaying={isPlaying}
                  isLoading={status === 'loading'}
                  disabled={status === 'loading' || !audioLoaded}
                  onToggle={togglePlayPause}
                  className="w-16 h-16 rounded-full shadow-xl shadow-muted/50"
                  ariaLabel={isPlaying ? t('ariaPause') : t('ariaPlay')}
                  iconSize={28}
                  playClassName="ms-1"
                  loadingClassName={cn(styles.animationPaused)}
                />
                <TransportSkipButton
                  direction="forward"
                  onClick={handleSkipForward}
                  className="h-12 w-12"
                  ariaLabel={t('skipForward10s')}
                  title={t('skipForward10s')}
                  iconSize={28}
                  iconStrokeWidth={1}
                />
              </div>

              {/* Right: Settings & Timer */}
              <div className="w-1/3 flex items-center justify-end gap-2">
                <PlayerDownloadAction />
                <ShareButton title={audioTitle} url={window.location.href} />
                <SleepTimerButton onOpenChange={setIsSleepTimerOpen} />
                <Popover open={isPlayerSettingsOpen} onOpenChange={setIsPlayerSettingsOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={t('ariaSettings')}>
                      <Settings2 size={20} strokeWidth={1.5} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    {...{ [PLAYER_OWNED_OVERLAY_ATTR]: 'true' }}
                  >
                    <ReadingBgControl />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}
