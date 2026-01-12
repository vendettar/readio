import React from 'react';
import { useExploreStore } from '../store/exploreStore';

/**
 * A hook that provides a memoized Map of feedUrl -> collectionId
 * for efficient O(1) subscription lookups.
 */
export function useSubscriptionMap() {
    const subscriptions = useExploreStore((s) => s.subscriptions);

    const subscriptionMap = React.useMemo(() => {
        const map = new Map<string, string>();
        subscriptions.forEach((sub) => {
            if (sub.collectionId) {
                map.set(sub.feedUrl, sub.collectionId);
            }
        });
        return map;
    }, [subscriptions]);

    return subscriptionMap;
}
