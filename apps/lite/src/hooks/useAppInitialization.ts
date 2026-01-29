import { useEffect, useRef } from 'react'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'

/**
 * App-level initialization hook
 * Loads subscriptions and favorites once on app mount
 * Also manages session restoration
 */
export function useAppInitialization() {
  const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions)
  const loadFavorites = useExploreStore((s) => s.loadFavorites)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)
  const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded)
  const restoreSession = usePlayerStore((s) => s.restoreSession)
  const playerStatus = usePlayerStore((s) => s.initializationStatus)
  const isPruned = useRef(false)

  useEffect(() => {
    // 1. Load explore data
    if (!subscriptionsLoaded) {
      loadSubscriptions()
    }
    if (!favoritesLoaded) {
      loadFavorites()
    }

    // 2. Restore playback session
    if (playerStatus === 'idle') {
      restoreSession()
    }

    // 3. Background maintenance
    if (!isPruned.current) {
      isPruned.current = true
      import('../lib/retention').then(({ prunePlaybackHistory }) => {
        prunePlaybackHistory()
      })
    }
  }, [
    subscriptionsLoaded,
    favoritesLoaded,
    loadSubscriptions,
    loadFavorites,
    playerStatus,
    restoreSession,
  ])

  // Ready when both explore data and player session are initialized
  const isReady =
    subscriptionsLoaded &&
    favoritesLoaded &&
    playerStatus !== 'idle' &&
    playerStatus !== 'restoring'
  const isHydrated = subscriptionsLoaded && favoritesLoaded

  return { isReady, isHydrated }
}
