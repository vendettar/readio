import React from 'react'
import { useExploreStore } from '../store/exploreStore'

/**
 * A hook that provides a memoized Map of feedUrl -> podcastItunesId
 * for efficient O(1) subscription lookups.
 */
export function useSubscriptionMap() {
  const subscriptions = useExploreStore((s) => s.subscriptions)

  const subscriptionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    subscriptions.forEach((sub) => {
      if (sub.podcastItunesId) {
        map.set(sub.feedUrl, sub.podcastItunesId)
      }
    })
    return map
  }, [subscriptions])

  return subscriptionMap
}
