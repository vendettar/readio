import { buildSubscriptionRecord, normalizeFavoriteRecord } from './recordNormalizers'
import type { ReadioDB } from './schema'
import type { Favorite, Subscription } from './types'

export function createSubscriptionsFavoritesDbMethods(db: ReadioDB, generateId: () => string) {
  return {
    async addSubscription(sub: Omit<Subscription, 'id'>): Promise<string> {
      const newSub = buildSubscriptionRecord(sub)
      await db.subscriptions.put(newSub)
      return newSub.id
    },

    async getSubscriptionByPodcastItunesId(
      podcastItunesId: string
    ): Promise<Subscription | undefined> {
      return db.subscriptions.where('podcastItunesId').equals(podcastItunesId).first()
    },

    async removeSubscriptionByPodcastItunesId(podcastItunesId: string): Promise<void> {
      const sub = await db.subscriptions.where('podcastItunesId').equals(podcastItunesId).first()
      if (sub) {
        await db.subscriptions.delete(sub.id)
      }
    },

    async getAllSubscriptions(): Promise<Subscription[]> {
      return db.subscriptions.orderBy('addedAt').reverse().toArray()
    },

    async addFavorite(fav: Omit<Favorite, 'id'>): Promise<string> {
      const newFav = normalizeFavoriteRecord(
        {
          id: generateId(),
          ...fav,
        },
        'favorite'
      )
      await db.favorites.put(newFav)
      return newFav.id
    },

    async getFavoriteByKey(key: string): Promise<Favorite | undefined> {
      return db.favorites.where('key').equals(key).first()
    },

    async removeFavoriteByKey(key: string): Promise<void> {
      const fav = await db.favorites.where('key').equals(key).first()
      if (fav) {
        await db.favorites.delete(fav.id)
      }
    },

    async getAllFavorites(): Promise<Favorite[]> {
      return db.favorites.orderBy('addedAt').reverse().toArray()
    },
  }
}
