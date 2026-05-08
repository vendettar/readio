import { useHotkeys } from 'react-hotkeys-hook'
import {
  executeKeyboardSeekBackward,
  executeKeyboardSeekForward,
} from '../lib/player/playerCommandActions'
import { usePlayerStore } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'
import { useSearchStore } from '../store/searchStore'

export function useKeyboardShortcuts() {
  const togglePlayPause = usePlayerStore((s) => s.togglePlayPause)

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
      executeKeyboardSeekBackward()
    },
    { enableOnFormTags: false }
  )

  // ArrowRight - Seek forward 15s
  useHotkeys(
    'right',
    (e) => {
      e.preventDefault()
      executeKeyboardSeekForward()
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
      const surfaceState = usePlayerSurfaceStore.getState()

      if (searchState.isOverlayOpen) {
        e.preventDefault()
        searchState.closeOverlay()
      } else if (surfaceState.mode === 'full') {
        e.preventDefault()
        if (surfaceState.canDockedRestore) {
          surfaceState.toDocked()
        } else {
          surfaceState.toMini()
        }
      }
    },
    { enableOnFormTags: true }
  )
}
