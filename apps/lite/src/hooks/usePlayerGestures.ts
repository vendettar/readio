import { useDrag } from '@use-gesture/react'
import { useState } from 'react'
import { useImmersionStore } from '../store/immersionStore'

/**
 * Hook for Full Player touch/drag gestures
 * Implements swipe-down to collapse with visual feedback
 */
export function usePlayerGestures() {
  const exitImmersion = useImmersionStore((s) => s.exitImmersion)
  const [y, setY] = useState(0)

  const bind = useDrag(
    ({ movement: [, my], active, cancel, event, first }) => {
      if (first) {
        const target = event?.target
        // Ignore drags starting inside the scrollable transcript content
        if (target instanceof Element && target.closest('[data-scroll-guard=\"transcript\"]')) {
          cancel()
          return
        }
      }

      if (active) {
        // Track displacement (only downwards)
        const newY = Math.max(0, my)
        setY(newY)

        // Trigger immediate collapse if threshold reached
        if (newY > 100) {
          exitImmersion()
          cancel() // Stop the gesture immediately
          setY(0)
        }
      } else {
        // Reset if released before threshold
        setY(0)
      }
    },
    {
      axis: 'y',
      filterTaps: true,
      bounds: { top: 0 },
    }
  )

  return { bind, y }
}
