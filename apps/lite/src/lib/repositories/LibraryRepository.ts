import type { Favorite, Subscription } from '../dexieDb'
import { DB, db } from '../dexieDb'
import { createId } from '../id'

export const LibraryRepository = {
  getSetting(key: string): Promise<string | null> {
    return DB.getSetting(key)
  },

  setSetting(key: string, value: string): Promise<void> {
    return DB.setSetting(key, value)
  },

  getAllSubscriptions(): Promise<Subscription[]> {
    return DB.getAllSubscriptions()
  },

  getSubscriptionByFeedUrl(feedUrl: string): Promise<Subscription | undefined> {
    return DB.getSubscriptionByFeedUrl(feedUrl)
  },

  addSubscription(sub: Omit<Subscription, 'id'>): Promise<string> {
    return DB.addSubscription(sub)
  },

  removeSubscriptionByFeedUrl(feedUrl: string): Promise<void> {
    return DB.removeSubscriptionByFeedUrl(feedUrl)
  },

  async bulkAddSubscriptionsIfMissing(
    candidates: Array<{
      feedUrl: string
      title: string
      author: string
      artworkUrl: string
      providerPodcastId?: string
      countryAtSave: string
    }>
  ): Promise<number> {
    if (!candidates.length) return 0

    let inserted = 0
    await db.transaction('rw', db.subscriptions, async () => {
      const existing = await db.subscriptions
        .where('feedUrl')
        .anyOf(candidates.map((candidate) => candidate.feedUrl))
        .toArray()
      const existingUrls = new Set(existing.map((subscription) => subscription.feedUrl))
      const now = Date.now()

      const newSubscriptions: Subscription[] = []
      for (const candidate of candidates) {
        if (existingUrls.has(candidate.feedUrl)) continue
        existingUrls.add(candidate.feedUrl)
        newSubscriptions.push({
          id: createId(),
          addedAt: now,
          ...candidate,
        })
      }

      if (newSubscriptions.length > 0) {
        await db.subscriptions.bulkPut(newSubscriptions)
      }
      inserted = newSubscriptions.length
    })

    return inserted
  },

  getAllFavorites(): Promise<Favorite[]> {
    return DB.getAllFavorites()
  },

  getFavoriteByKey(key: string): Promise<Favorite | undefined> {
    return DB.getFavoriteByKey(key)
  },

  addFavorite(favorite: Omit<Favorite, 'id'>): Promise<string> {
    return DB.addFavorite(favorite)
  },

  removeFavoriteByKey(key: string): Promise<void> {
    return DB.removeFavoriteByKey(key)
  },
}
