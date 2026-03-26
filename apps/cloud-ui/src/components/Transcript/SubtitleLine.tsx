import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { formatTimeLabel } from '../../lib/formatters'
import { hasTranscriptOwnedSelection, type SelectionOwner } from '../../lib/selection'
import { isInteractiveWord, tokenize } from '../../lib/text'
import { Word } from './Word'

interface SubtitleLineProps {
  lineIndex: number
  cueKey: string
  start: number
  text: string
  language: string
  isActive: boolean
  isHoverLocked: boolean
  isPinnedHover: boolean
  onJumpToSubtitle: () => void
  onWordLookup: (word: string, rect: DOMRect, owner: SelectionOwner) => void
  onWordContextMenu: (
    word: string,
    x: number,
    y: number,
    rect: DOMRect,
    owner: SelectionOwner
  ) => void
  onHoverChange: (hovered: boolean) => void
  wasDraggingRef: React.RefObject<boolean>
}

export function SubtitleLine({
  lineIndex,
  cueKey,
  start,
  text,
  language,
  isActive,
  isHoverLocked,
  isPinnedHover,
  onJumpToSubtitle,
  onWordLookup,
  onWordContextMenu,
  onHoverChange,
  wasDraggingRef,
}: SubtitleLineProps) {
  const lineOwner: SelectionOwner = {
    ownerCueKey: cueKey,
    ownerCueStartMs: start,
    ownerKind: 'line',
  }

  const isWordTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('[data-owner-kind="word"]') !== null

  const isLineActionButtonTarget = (target: EventTarget | null): boolean =>
    target instanceof Element && target.closest('[data-line-action-button="true"]') !== null

  const activateJump = (target: HTMLElement) => {
    // 1. Check shared drag state from the global selection handler
    if (wasDraggingRef.current) {
      return
    }

    const container = target.closest('.reading-area')
    if (hasTranscriptOwnedSelection(container)) {
      return
    }

    onJumpToSubtitle()
  }

  const openLineContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    window.getSelection()?.removeAllRanges()
    onWordContextMenu(
      text,
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      lineOwner
    )
  }

  const handleLineJumpButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (event.detail === 0) return
    activateJump(event.currentTarget)
  }

  const handleLineJumpButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return
    event.preventDefault()
    event.stopPropagation()
    activateJump(event.currentTarget)
  }

  // Split text into tokens (words and separators)
  const tokens = useMemo(() => {
    return tokenize(text, language)
  }, [text, language])

  return (
    <div
      data-line-index={lineIndex}
      data-owner-cue-key={cueKey}
      data-owner-cue-start={start}
      data-owner-kind="line"
      onClick={(e) => {
        if (isWordTarget(e.target) || isLineActionButtonTarget(e.target)) return
        activateJump(e.currentTarget)
      }}
      onContextMenu={(e) => {
        if (isWordTarget(e.target) || isLineActionButtonTarget(e.target)) return
        openLineContextMenu(e)
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      className={cn(
        'relative pt-3 pb-2 px-6 rounded-2xl transition-all duration-300 group subtitle-line',
        isActive
          ? 'bg-primary/15 shadow-sm'
          : isPinnedHover
            ? 'bg-accent/40'
            : !isHoverLocked && 'hover:bg-accent/40'
      )}
    >
      <div className="relative">
        <button
          type="button"
          aria-label={text}
          data-line-action-button="true"
          onClick={handleLineJumpButtonClick}
          onKeyDown={handleLineJumpButtonKeyDown}
          className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-3 focus:z-10 focus:rounded-md focus:bg-background focus:px-2 focus:py-1 focus:text-sm focus:text-foreground focus:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Jump
        </button>
        <span className="pointer-events-none text-xs font-mono text-muted-foreground/50 mb-1 block select-none">
          {formatTimeLabel(start)}
        </span>
        <p
          className={cn(
            'font-serif transition-colors duration-200 subtitle-text !mb-0 inline-block',
            isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
          )}
        >
          {tokens.map((token, i) => {
            if (isInteractiveWord(token)) {
              return (
                <Word
                  key={`${i}-${token}`}
                  text={token}
                  cueKey={cueKey}
                  cueStartMs={start}
                  onClick={onWordLookup}
                  onContextMenu={onWordContextMenu}
                />
              )
            }
            return token
          })}
        </p>
      </div>
    </div>
  )
}
