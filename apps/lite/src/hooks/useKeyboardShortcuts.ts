import { useHotkeys } from 'react-hotkeys-hook'
import { useImmersionStore } from '../store/immersionStore'
import { usePlayerStore } from '../store/playerStore'
import { useSearchStore } from '../store/searchStore'

export function useKeyboardShortcuts() {
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause)
  const seekTo = usePlayerStore((s) => s.seekTo)

  // Space - Toggle Play/Pause
  useHotkeys(
    'space',
    () => {
      togglePlayPause()
    },
    { preventDefault: true, enableOnFormTags: false }
  )

  // ArrowLeft - Seek back 15s
  useHotkeys(
    'left',
    (e) => {
      e.preventDefault()
      const { progress } = usePlayerStore.getState()
      seekTo(Math.max(0, progress - 15))
    },
    { enableOnFormTags: false }
  )

  // ArrowRight - Seek forward 15s
  useHotkeys(
    'right',
    (e) => {
      e.preventDefault()
      const { progress, duration } = usePlayerStore.getState()
      // If duration is not yet available (e.g., 0 or negative), just add 15s without clamping.
      // Otherwise, clamp to duration.
      seekTo(duration > 0 ? Math.min(duration, progress + 15) : progress + 15)
    },
    { enableOnFormTags: false }
  )

  // Cmd+K - Toggle Search
  useHotkeys(
    'mod+k',
    (e) => {
      e.preventDefault()
      const { isOverlayOpen, closeOverlay, openOverlay } = useSearchStore.getState()
      if (isOverlayOpen) {
        closeOverlay()
      } else {
        openOverlay()
      }
    },
    { enableOnFormTags: true }
  )

  // Esc - Close Search or Exit Immersion
  useHotkeys(
    'esc',
    (e) => {
      const searchState = useSearchStore.getState()
      const immersionState = useImmersionStore.getState()

      if (searchState.isOverlayOpen) {
        e.preventDefault()
        searchState.closeOverlay()
      } else if (immersionState.isImmersed) {
        e.preventDefault()
        immersionState.exitImmersion()
      }
    },
    { enableOnFormTags: true }
  )
}
