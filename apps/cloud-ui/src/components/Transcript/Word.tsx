// src/components/Transcript/Word.tsx
import { memo, useId } from 'react'
import { cn } from '@/lib/utils'
import {
  hasTranscriptOwnedSelection,
  isLookupEligible,
  type SelectionOwner,
} from '../../lib/selection'
import { normalizeInteractiveWord } from '../../lib/text'
import { useTranscriptStore } from '../../store/transcriptStore'

interface WordProps {
  text: string
  cueKey: string
  cueStartMs: number
  onClick: (word: string, rect: DOMRect, owner: SelectionOwner) => void
  onContextMenu: (word: string, x: number, y: number, rect: DOMRect, owner: SelectionOwner) => void
}

export const Word = memo(function Word({
  text,
  cueKey,
  cueStartMs,
  onClick,
  onContextMenu,
}: WordProps) {
  const highlightedWord = useTranscriptStore((s) => s.highlightedWord)
  const setHighlightedWord = useTranscriptStore((s) => s.setHighlightedWord)
  const instanceId = useId()

  const normalizedWord = normalizeInteractiveWord(text)
  const isLookupCapable = isLookupEligible(normalizedWord)

  const isHighlighted = highlightedWord === instanceId && normalizedWord.length > 0

  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation()
    const container = e.currentTarget.closest('.reading-area')
    if (hasTranscriptOwnedSelection(container)) {
      return
    }
    if (!isLookupCapable) return
    setHighlightedWord(instanceId)
    onClick(normalizedWord, e.currentTarget.getBoundingClientRect(), {
      ownerCueKey: cueKey,
      ownerCueStartMs: cueStartMs,
      ownerKind: 'word',
      ownerTokenInstanceId: instanceId,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return
    e.preventDefault()
    e.stopPropagation()
    if (!isLookupCapable) return
    const container = e.currentTarget.closest('.reading-area')
    if (hasTranscriptOwnedSelection(container)) {
      return
    }
    setHighlightedWord(instanceId)
    onClick(normalizedWord, e.currentTarget.getBoundingClientRect(), {
      ownerCueKey: cueKey,
      ownerCueStartMs: cueStartMs,
      ownerKind: 'word',
      ownerTokenInstanceId: instanceId,
    })
  }

  const handleContextMenu = (e: React.MouseEvent<HTMLSpanElement>) => {
    const container = e.currentTarget.closest('.reading-area')
    if (hasTranscriptOwnedSelection(container)) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    window.getSelection()?.removeAllRanges()

    if (!normalizedWord) return
    setHighlightedWord(instanceId)
    onContextMenu(normalizedWord, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), {
      ownerCueKey: cueKey,
      ownerCueStartMs: cueStartMs,
      ownerKind: 'word',
      ownerTokenInstanceId: instanceId,
    })
  }

  return (
    <span
      data-lookup-word="true"
      data-owner-cue-key={cueKey}
      data-owner-cue-start={cueStartMs}
      data-owner-kind="word"
      data-owner-instance-id={instanceId}
      role={isLookupCapable ? 'button' : undefined}
      tabIndex={isLookupCapable ? 0 : undefined}
      onClick={handleClick}
      onKeyDown={isLookupCapable ? handleKeyDown : undefined}
      onContextMenu={handleContextMenu}
      className={cn(
        'pointer-events-auto inline rounded-sm outline-none',
        isLookupCapable
          ? 'transition-colors duration-200 cursor-pointer hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary'
          : 'cursor-default',
        isHighlighted && 'bg-primary/20 text-primary-foreground font-medium'
      )}
    >
      {text}
    </span>
  )
})
