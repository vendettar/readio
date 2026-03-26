import React from 'react'
import { useExploreStore } from '../store/exploreStore'

/**
 * A hook that provides a memoized Map of feedUrl -> providerPodcastId
 * for efficient O(1) subscription lookups.
 */
export function useSubscriptionMap() {
  const subscriptions = useExploreStore((s) => s.subscriptions)

  const subscriptionMap = React.useMemo(() => {
    const map = new Map<string, string>()
    subscriptions.forEach((sub) => {
      if (sub.providerPodcastId) {
        map.set(sub.feedUrl, sub.providerPodcastId)
      }
    })
    return map
  }, [subscriptions])

  return subscriptionMap
}
