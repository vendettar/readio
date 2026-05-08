import type { Subscription } from '../lib/dexieDb'
import type { Podcast } from '../lib/discovery'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import { SubscriptionRepository } from '../lib/repositories/SubscriptionRepository'
import { deduplicatedFetchWithCallerAbort } from '../lib/requestManager'
import {
  prependExploreSubscription,
  removeExploreSubscriptionByPodcastItunesId,
  replaceExploreSubscriptions,
} from './exploreStoreMutations'
import {
  buildSubscriptionPersistenceInput,
  handleExploreDbWriteError,
  normalizeCountryAtSaveForExplore,
} from './exploreStorePersistence'

type ExploreSubscriptionState = {
  subscriptions: Subscription[]
  subscriptionsLoaded: boolean
}

type SetExploreSubscriptionState = (partial: Partial<ExploreSubscriptionState>) => void

type GetExploreSubscriptionState = () => ExploreSubscriptionState

export function createExploreSubscriptionActions(
  set: SetExploreSubscriptionState,
  get: GetExploreSubscriptionState
): {
  loadSubscriptions: () => Promise<void>
  refreshSubscriptions: () => Promise<void>
  subscribe: (
    podcast: Podcast,
    signal: AbortSignal | undefined,
    countryAtSave: string
  ) => Promise<void>
  unsubscribe: (podcastItunesId: string, signal?: AbortSignal) => Promise<void>
  isSubscribed: (podcastItunesId: string) => boolean
} {
  return {
    loadSubscriptions: async () => {
      if (get().subscriptionsLoaded) return

      return deduplicatedFetchWithCallerAbort('loadSubscriptions', undefined, async () => {
        try {
          const subs = await SubscriptionRepository.getAllSubscriptions()
          set({
            subscriptions: replaceExploreSubscriptions(subs),
            subscriptionsLoaded: true,
          })
        } catch (error) {
          if (!isAbortLikeError(error)) warn('[ExploreStore] Failed to load subscriptions:', error)
          set({ subscriptionsLoaded: false })
        }
      })
    },

    refreshSubscriptions: async () => {
      return deduplicatedFetchWithCallerAbort('loadSubscriptions', undefined, async () => {
        try {
          const subs = await SubscriptionRepository.getAllSubscriptions()
          set({
            subscriptions: replaceExploreSubscriptions(subs),
            subscriptionsLoaded: true,
          })
        } catch (error) {
          if (!isAbortLikeError(error)) {
            warn('[ExploreStore] Failed to refresh subscriptions:', error)
          }
        }
      })
    },

    subscribe: async (podcast, signal, countryAtSave) => {
      if (signal?.aborted) return
      const normalizedCountryAtSave = normalizeCountryAtSaveForExplore(
        countryAtSave,
        'subscription persistence'
      )
      if (!normalizedCountryAtSave) return

      const subData = buildSubscriptionPersistenceInput(podcast, normalizedCountryAtSave)
      if (!subData) return

      const dedupeKey = `subscribe:${subData.podcastItunesId}`

      return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
        try {
          const existing = await SubscriptionRepository.getSubscriptionByPodcastItunesId(
            subData.podcastItunesId
          )
          if (sharedSignal.aborted) return

          if (existing) return
          const id = await SubscriptionRepository.addSubscription(subData)
          if (sharedSignal.aborted) return

          const newSub = { id, ...subData }
          set({
            subscriptions: prependExploreSubscription(get().subscriptions, newSub),
          })
        } catch (error) {
          if (sharedSignal.aborted) return
          handleExploreDbWriteError('subscribe', 'toastSubscribeFailed', error)
        }
      })
    },

    unsubscribe: async (podcastItunesId, signal) => {
      if (signal?.aborted) return
      const normalizedPodcastItunesId = podcastItunesId.trim()
      if (!normalizedPodcastItunesId) return
      const dedupeKey = `unsubscribe:${normalizedPodcastItunesId}`

      return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
        try {
          await SubscriptionRepository.removeSubscriptionByPodcastItunesId(
            normalizedPodcastItunesId
          )
          if (sharedSignal.aborted) return

          set({
            subscriptions: removeExploreSubscriptionByPodcastItunesId(
              get().subscriptions,
              normalizedPodcastItunesId
            ),
          })
        } catch (error) {
          if (sharedSignal.aborted) return
          handleExploreDbWriteError('unsubscribe', 'toastUnsubscribeFailed', error)
        }
      })
    },

    isSubscribed: (podcastItunesId) => {
      const normalizedPodcastItunesId = podcastItunesId.trim()
      return get().subscriptions.some(
        (subscription) => subscription.podcastItunesId === normalizedPodcastItunesId
      )
    },
  }
}
