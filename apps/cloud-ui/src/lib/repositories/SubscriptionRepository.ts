import type { Subscription } from '../dexieDb'
import { buildSubscriptionRecord, DB, db, normalizeSubscriptionRecord } from '../dexieDb'

export const SubscriptionRepository = {
  getAllSubscriptions(): Promise<Subscription[]> {
    return DB.getAllSubscriptions()
  },

  getSubscriptionByPodcastItunesId(podcastItunesId: string): Promise<Subscription | undefined> {
    return DB.getSubscriptionByPodcastItunesId(podcastItunesId)
  },

  addSubscription(sub: Omit<Subscription, 'id'>): Promise<string> {
    return DB.addSubscription(sub)
  },

  removeSubscriptionByPodcastItunesId(podcastItunesId: string): Promise<void> {
    return DB.removeSubscriptionByPodcastItunesId(podcastItunesId)
  },

  async bulkAddSubscriptionsIfMissing(
    candidates: Array<{
      podcastItunesId: string
      title: string
      author: string
      artworkUrl: string
      countryAtSave: string
    }>
  ): Promise<number> {
    if (!candidates.length) return 0

    const normalizedCandidates = candidates.map((candidate) =>
      normalizeSubscriptionRecord(
        {
          id: `candidate:${candidate.podcastItunesId}`,
          ...candidate,
          addedAt: Date.now(),
        },
        'subscription candidate'
      )
    )

    let inserted = 0
    await db.transaction('rw', db.subscriptions, async () => {
      const existing = await db.subscriptions
        .where('podcastItunesId')
        .anyOf(normalizedCandidates.map((candidate) => candidate.podcastItunesId))
        .toArray()
      const existingIds = new Set(existing.map((subscription) => subscription.podcastItunesId))
      const newSubscriptions: Subscription[] = []
      for (const candidate of normalizedCandidates) {
        if (existingIds.has(candidate.podcastItunesId)) continue
        existingIds.add(candidate.podcastItunesId)
        newSubscriptions.push(
          buildSubscriptionRecord({
            podcastItunesId: candidate.podcastItunesId,
            title: candidate.title,
            author: candidate.author,
            artworkUrl: candidate.artworkUrl,
            addedAt: candidate.addedAt,
            countryAtSave: candidate.countryAtSave,
          })
        )
      }

      if (newSubscriptions.length > 0) {
        await db.subscriptions.bulkPut(newSubscriptions)
        inserted = newSubscriptions.length
      }
    })

    return inserted
  },
}
