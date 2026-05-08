import type { Favorite, Subscription } from '../lib/dexieDb'

export function replaceExploreSubscriptions(subscriptions: Subscription[]): Subscription[] {
  return subscriptions
}

export function prependExploreSubscription(
  subscriptions: Subscription[],
  subscription: Subscription
): Subscription[] {
  return [subscription, ...subscriptions]
}

export function removeExploreSubscriptionByPodcastItunesId(
  subscriptions: Subscription[],
  podcastItunesId: string
): Subscription[] {
  return subscriptions.filter((subscription) => subscription.podcastItunesId !== podcastItunesId)
}

export function replaceExploreFavorites(favorites: Favorite[]): Favorite[] {
  return favorites
}

export function prependExploreFavorite(favorites: Favorite[], favorite: Favorite): Favorite[] {
  return [favorite, ...favorites]
}

export function removeExploreFavoriteByKey(favorites: Favorite[], key: string): Favorite[] {
  return favorites.filter((favorite) => favorite.key !== key)
}
