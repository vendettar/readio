import { forwardRef, type HTMLAttributes, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Components, Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { cn } from '@/lib/utils'
import { useSelection } from '../../hooks/useSelection'
import type { ASRCue } from '../../lib/asr/types'
import { reportError } from '../../lib/errorReporter'
import { refreshHighlights, type SelectionOwner } from '../../lib/selection'
import { useTranscriptStore } from '../../store/transcriptStore'
import { SelectionUI } from '../Selection'
import { ComponentErrorBoundary } from '../ui/error-boundary'
import { SubtitleLine } from './SubtitleLine'

interface TranscriptViewProps {
  subtitles: ASRCue[]
  currentIndex: number
  onJumpToSubtitle: (index: number) => void
  isFollowing: boolean
  onFollowingChange: (following: boolean) => void
  zoomScale: number
}

const Scroller = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>((props, ref) => (
  <div {...props} ref={ref} className={cn(props.className, 'custom-scrollbar')} />
)) as unknown as NonNullable<Components['Scroller']> as unknown as NonNullable<Components['Scroller']>

function TranscriptViewInner({
  subtitles,
  currentIndex,
  onJumpToSubtitle,
  isFollowing,
  onFollowingChange,
  zoomScale,
}: TranscriptViewProps) {
  const { i18n } = useTranslation()
  const language = i18n?.resolvedLanguage ?? i18n?.language ?? 'en'
  const containerRef = useRef<HTMLDivElement>(null)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const {
    state,
    wasDraggingRef,
    copyText,
    searchWeb,
    openWordMenu,
    openLineMenu,
    lookupWord,
    lookupFromMenu,
    closeUI,
  } = useSelection(containerRef, { lookupLanguage: language })

  const highlightRefreshHandleRef = useRef<number | null>(null)
  const isProgrammaticScrollRef = useRef(false)
  const lastCurrentIndexRef = useRef(currentIndex)
  const [hoveredLineIndex, setHoveredLineIndex] = useState<number | null>(null)
  const [lockedHoverLineIndex, setLockedHoverLineIndex] = useState<number | null>(null)
  const lastHoveredLineIndexRef = useRef<number | null>(null)

  const setHighlightedWord = useTranscriptStore((s) => s.setHighlightedWord)

  const shouldLockHover = state.surface.type !== 'none'

  const resolveSurfaceLineIndex = useCallback(() => {
    const { surface } = state
    if (surface.type === 'none') return -1

    const { ownerCueKey, ownerCueStartMs } = surface.owner
    if (!ownerCueKey || ownerCueKey === 'unknown') return -1

    // 1. Try match by key (standard format: start-end)
    let matchedIndex = subtitles.findIndex((s) => `${s.start}-${s.end}` === ownerCueKey)

    // 2. Fallback to start time (survives key format changes or test differences)
    if (matchedIndex === -1 && typeof ownerCueStartMs === 'number') {
      matchedIndex = subtitles.findIndex((s) => Math.abs(s.start - ownerCueStartMs) < 0.001)
    }

    return matchedIndex
  }, [state, subtitles])

  const scheduleHighlightsRefresh = useCallback(() => {
    if (highlightRefreshHandleRef.current !== null) return

    highlightRefreshHandleRef.current = requestAnimationFrame(() => {
      highlightRefreshHandleRef.current = null
      refreshHighlights()
    })
  }, [])

  // Handle range changes - refresh highlights when rendered items change
  const handleRangeChanged = useCallback(() => {
    scheduleHighlightsRefresh()
  }, [scheduleHighlightsRefresh])

  // Auto-scroll to current subtitle when following is enabled and index changes
  useEffect(() => {
    if (!isFollowing || currentIndex < 0 || currentIndex >= subtitles.length) {
      lastCurrentIndexRef.current = currentIndex
      return
    }

    // Check if index changed
    if (currentIndex === lastCurrentIndexRef.current) {
      return
    }
    lastCurrentIndexRef.current = currentIndex

    // Scroll to current index
    if (virtuosoRef.current) {
      isProgrammaticScrollRef.current = true
      virtuosoRef.current.scrollToIndex({
        index: currentIndex,
        align: 'center',
        behavior: 'smooth',
      })
    }
  }, [currentIndex, subtitles.length, isFollowing])

  // Scroll to current index when following is re-enabled
  useEffect(() => {
    if (
      isFollowing &&
      virtuosoRef.current &&
      currentIndex >= 0 &&
      currentIndex < subtitles.length
    ) {
      isProgrammaticScrollRef.current = true
      virtuosoRef.current.scrollToIndex({
        index: currentIndex,
        align: 'center',
        behavior: 'smooth',
      })
    }
  }, [isFollowing, currentIndex, subtitles.length]) // Only trigger when isFollowing changes to true

  // Detect user scroll - disable following
  const handleScroll = useCallback(() => {
    if (isProgrammaticScrollRef.current) {
      return
    }

    // User scrolled manually - stop following
    if (isFollowing) {
      onFollowingChange(false)
    }
  }, [isFollowing, onFollowingChange])

  // Trigger Virtuoso re-measurement when zoom changes (CSS calc affects line heights)
  useEffect(() => {
    // Force Virtuoso to re-measure all items when zoom scale changes
    // This prevents scroll position drift caused by CSS-calculated heights
    if (virtuosoRef.current && zoomScale) {
      // Small delay to let CSS transitions settle
      const timer = setTimeout(() => {
        // Trigger a simple scroll to force re-measurement
        virtuosoRef.current?.scrollBy({ top: 0, behavior: 'auto' })
      }, 50)
      // Trigger highlight refresh since bounding boxes changed
      refreshHighlights()

      return () => clearTimeout(timer)
    }
  }, [zoomScale])

  useEffect(() => {
    return () => {
      if (highlightRefreshHandleRef.current !== null) {
        cancelAnimationFrame(highlightRefreshHandleRef.current)
        highlightRefreshHandleRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (shouldLockHover) {
      const surfaceLineIndex = resolveSurfaceLineIndex()
      setLockedHoverLineIndex(
        surfaceLineIndex >= 0
          ? surfaceLineIndex
          : (hoveredLineIndex ?? lastHoveredLineIndexRef.current)
      )
      return
    }

    setLockedHoverLineIndex(null)
  }, [shouldLockHover, hoveredLineIndex, resolveSurfaceLineIndex])

  const handleScrollingStateChange = useCallback((isScrolling: boolean) => {
    if (!isScrolling) {
      isProgrammaticScrollRef.current = false
    }
  }, [])

  const handleContainerClick = useCallback(() => {
    // Clear highlighted word when clicking background
    setHighlightedWord(null)
  }, [setHighlightedWord])

  const handleWordLookup = useCallback(
    (word: string, rect: DOMRect, owner: SelectionOwner) => {
      const x = rect.left + rect.width / 2
      const y = rect.top - 12
      void lookupWord(word, x, y, rect, owner)
    },
    [lookupWord]
  )

  const handleWordContextMenu = useCallback(
    (_word: string, x: number, y: number, rect: DOMRect, owner: SelectionOwner) => {
      if (owner.ownerKind === 'line') {
        openLineMenu(_word, x, y, rect, owner, 'line')
        return
      }

      const stableX = rect.left + rect.width / 2
      const stableY = rect.top
      openWordMenu(_word, stableX, stableY, rect, owner)
    },
    [openLineMenu, openWordMenu]
  )

  const handleLineHoverChange = useCallback(
    (index: number, hovered: boolean) => {
      if (shouldLockHover) return

      if (hovered) {
        lastHoveredLineIndexRef.current = index
        setHoveredLineIndex(index)
        return
      }

      setHoveredLineIndex((current) => (current === index ? null : current))
    },
    [shouldLockHover]
  )

  return (
    <>
      <div
        id="transcript-container"
        ref={containerRef}
        onClick={handleContainerClick}
        data-scroll-guard="transcript"
        className={cn(
          'reading-area h-full prose transcript-text max-w-none touch-pan-y',
          state.surface.type === 'lookup' && 'pointer-events-none'
        )}
      >
        <Virtuoso
          key={`virtuoso-${zoomScale}`}
          ref={virtuosoRef}
          data={subtitles}
          totalCount={subtitles.length}
          itemContent={(index, subtitle) => (
            <div className="max-w-3xl mx-auto px-6 py-1">
              <SubtitleLine
                key={`${subtitle.start}-${subtitle.end}`}
                lineIndex={index}
                cueKey={`${subtitle.start}-${subtitle.end}`}
                start={subtitle.start}
                text={subtitle.text}
                language={language}
                isActive={index === currentIndex}
                isHoverLocked={lockedHoverLineIndex !== null}
                isPinnedHover={lockedHoverLineIndex === index}
                onJumpToSubtitle={() => onJumpToSubtitle(index)}
                onWordLookup={handleWordLookup}
                onWordContextMenu={handleWordContextMenu}
                onHoverChange={(hovered) => handleLineHoverChange(index, hovered)}
                wasDraggingRef={wasDraggingRef}
              />
            </div>
          )}
          rangeChanged={handleRangeChanged}
          onScroll={handleScroll}
          isScrolling={handleScrollingStateChange}
          className="h-full"
          components={{ Scroller }}
        />
      </div>

      {/* Selection UI */}
      <SelectionUI
        state={state}
        onCopy={copyText}
        onSearch={searchWeb}
        onLookup={lookupFromMenu}
        onClose={closeUI}
      />
    </>
  )
}

export function TranscriptView(props: TranscriptViewProps) {
  return (
    <ComponentErrorBoundary componentName="TranscriptView" className="h-full" onError={reportError}>
      <TranscriptViewInner {...props} />
    </ComponentErrorBoundary>
  )
}
