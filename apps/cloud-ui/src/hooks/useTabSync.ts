import { useEffect } from 'react'
import { createId } from '../lib/id'
import { pausePlayerIfActive } from '../lib/player/playerInteractionRuntime'
import { usePlayerStore } from '../store/playerStore'
import { createTabSyncTransport } from './tabSyncRuntime'

export function useTabSync(): void {
  useEffect(() => {
    const tabId = createId()
    const transport = createTabSyncTransport({
      tabId,
      onIncomingPlaying: () => {
        pausePlayerIfActive()
      },
    })

    const unsubscribe = usePlayerStore.subscribe((state, prevState) => {
      const startedPlaying =
        prevState.status !== 'playing' && state.status === 'playing' && state.isPlaying
      if (startedPlaying) {
        transport.postPlaying(tabId)
      }
    })

    return () => {
      transport.destroy()
      unsubscribe()
    }
  }, [])
}
