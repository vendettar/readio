// src/components/Transcript/SubtitleLine.tsx
import { useCallback } from 'react'

interface SubtitleLineProps {
  start: number
  text: string
  isActive: boolean
  onClick: () => void
}

export function SubtitleLine({ text, isActive, onClick }: SubtitleLineProps) {
  // Smart click handler: allows text selection without triggering seek
  const handleClick = useCallback(() => {
    const selection = window.getSelection()
    // If user has selected text (length > 0), assume they are interacting/reading/copying
    // and DO NOT seek.
    if (selection && selection.toString().length > 0) {
      return
    }
    onClick()
  }, [onClick])

  return (
    <div
      onClick={handleClick}
      className={`
                p-6 rounded-2xl transition-all duration-300 cursor-pointer group select-text subtitle-line
                ${isActive ? 'bg-primary/10 shadow-sm' : 'hover:bg-muted/50'}
            `}
    >
      <p
        className={`
                    text-xl md:text-2xl font-serif leading-relaxed transition-colors duration-200 subtitle-text
                    ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}
                `}
      >
        {text}
      </p>
    </div>
  )
}
