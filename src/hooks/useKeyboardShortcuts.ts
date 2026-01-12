// src/hooks/useKeyboardShortcuts.ts
// Original shortcuts: Space, Left Arrow, Right Arrow
import { useEffect } from 'react'
import { usePlayerStore } from '../store/playerStore'

interface KeyboardShortcutsOptions {
  isModalOpen?: boolean
}

export function useKeyboardShortcuts({ isModalOpen = false }: KeyboardShortcutsOptions = {}) {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Skip if modal is open (allow modal to handle its own keyboard events)
      if (isModalOpen) {
        return
      }

      // Ignore if typing in input field
      const target = e.target as HTMLElement
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        return
      }

      // Read latest state inside handler to avoid frequent effect re-runs
      const { togglePlayPause, subtitles, currentIndex, seekTo } = usePlayerStore.getState()
      const key = e.key

      switch (key) {
        case ' ': // Space - Play/Pause
          e.preventDefault()
          togglePlayPause()
          break

        case 'ArrowLeft': // ← - Previous line
          e.preventDefault()
          if (subtitles.length > 0 && currentIndex > 0) {
            const prevSubtitle = subtitles[currentIndex - 1]
            if (prevSubtitle) {
              seekTo(prevSubtitle.start)
            }
          }
          break

        case 'ArrowRight': // → - Next line
          e.preventDefault()
          if (subtitles.length > 0 && currentIndex < subtitles.length - 1) {
            const nextSubtitle = subtitles[currentIndex + 1]
            if (nextSubtitle) {
              seekTo(nextSubtitle.start)
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isModalOpen]) // Only re-bind when modal state changes
}
