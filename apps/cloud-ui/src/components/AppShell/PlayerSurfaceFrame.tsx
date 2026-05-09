import { motion } from 'framer-motion'
import { Minimize2 } from 'lucide-react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
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
import {
  TRANSCRIPT_IMPORTED_EVENT,
  type TranscriptImportedEventDetail,
} from '../../lib/player/playbackExport'
import { resolveCurrentPlaybackIdentity } from '../../lib/player/playbackIdentity'
import { resolvePlaybackContentIdentityKey } from '../../lib/player/playbackMetadata'
import { cn } from '../../lib/utils'
import { usePlayerStore } from '../../store/playerStore'
import type { SurfaceMode } from '../../store/playerSurfaceStore'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { FollowButton } from '../FollowButton/FollowButton'
import { Button } from '../ui/button'
import { PlayerSurfaceArtwork } from './PlayerSurfaceArtwork'
import { PlayerSurfaceFooter } from './PlayerSurfaceFooter'
import { PlayerSurfaceHeader } from './PlayerSurfaceHeader'

const ReadingContent = lazy(async () => {
  const module = await import('./ReadingContent')
  return { default: module.ReadingContent }
})

function ReadingContentFallback() {
  return <div className="flex-1 min-h-0" data-testid="reading-content-fallback" />
}

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

  const activeEpisodeId =
    resolvePlaybackContentIdentityKey({ audioUrl, metadata: episodeMetadata }) ?? 'active'

  const [isAutoScrolling, setIsAutoScrolling] = useState(true)
  const [isPlayerSettingsOpen, setIsPlayerSettingsOpen] = useState(false)
  const [isSleepTimerOpen, setIsSleepTimerOpen] = useState(false)
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

  useEffect(() => {
    const handleTranscriptImported = (event: Event) => {
      const detail = (event as CustomEvent<TranscriptImportedEventDetail>).detail
      const currentIdentity = resolveCurrentPlaybackIdentity()
      if (!detail || !currentIdentity) return
      if (detail.playbackIdentityKey !== currentIdentity.playbackIdentityKey) return
      setIsAutoScrolling(true)
    }

    window.addEventListener(TRANSCRIPT_IMPORTED_EVENT, handleTranscriptImported as EventListener)
    return () => {
      window.removeEventListener(
        TRANSCRIPT_IMPORTED_EVENT,
        handleTranscriptImported as EventListener
      )
    }
  }, [])

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

      <PlayerSurfaceHeader
        isDocked={isDocked}
        hasActiveTrack={hasActiveTrack}
        audioTitle={audioTitle}
        onMinimize={toMini}
        onExit={handleExit}
      />

      {/* 2. Central Content Area (Persistent ReadingContent) */}
      <div className="flex-1 flex overflow-hidden relative pointer-events-auto">
        {isFull && hasActiveTrack && (
          <PlayerSurfaceArtwork
            isDesktop={isDesktop}
            isVisible={isVisible}
            activeEpisodeId={activeEpisodeId}
            coverArtUrl={coverArtUrl}
            effectiveCoverArtUrl={effectiveCoverArtUrl}
            audioTitle={audioTitle}
            audioUrl={audioUrl}
          />
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
              {/* PERSISTENT ReadingContent Instance */}
              <Suspense fallback={<ReadingContentFallback />}>
                <ReadingContent
                  variant={mode}
                  isAutoScrolling={isAutoScrolling}
                  setIsAutoScrolling={setIsAutoScrolling}
                />
              </Suspense>

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
        <PlayerSurfaceFooter
          audioTitle={audioTitle}
          audioLoaded={audioLoaded}
          isPlaying={isPlaying}
          status={status}
          playbackRate={playbackRate}
          togglePlayPause={togglePlayPause}
          handleSkipBack={handleSkipBack}
          handleSkipForward={handleSkipForward}
          handlePlaybackRateClick={handlePlaybackRateClick}
          isPlayerSettingsOpen={isPlayerSettingsOpen}
          setIsPlayerSettingsOpen={setIsPlayerSettingsOpen}
          setIsSleepTimerOpen={setIsSleepTimerOpen}
          PLAYER_OWNED_OVERLAY_ATTR={PLAYER_OWNED_OVERLAY_ATTR}
        />
      )}
    </motion.div>
  )
}
