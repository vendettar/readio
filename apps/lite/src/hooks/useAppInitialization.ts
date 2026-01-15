import { useEffect } from 'react'
import { useExploreStore } from '../store/exploreStore'

/**
 * App-level initialization hook
 * Loads subscriptions and favorites once on app mount
 * This prevents redundant calls from individual components
 */
export function useAppInitialization() {
  const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions)
  const loadFavorites = useExploreStore((s) => s.loadFavorites)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)
  const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded)

  useEffect(() => {
    // Load data once on app mount
    if (!subscriptionsLoaded) {
      loadSubscriptions()
    }
    if (!favoritesLoaded) {
      loadFavorites()
    }
  }, [subscriptionsLoaded, favoritesLoaded, loadSubscriptions, loadFavorites])
}
