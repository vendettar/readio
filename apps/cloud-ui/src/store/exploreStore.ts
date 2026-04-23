// src/store/exploreStore.ts
import { create } from 'zustand'
import { normalizeCountryCode } from '../constants/app'
import type { Favorite, Subscription } from '../lib/dexieDb'
import type { FavoriteEpisodeInput, Podcast } from '../lib/discovery'
import { normalizeFeedUrl } from '../lib/discovery/feedUrl'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import type { MinimalSubscription } from '../lib/opmlParser'
import { LibraryRepository } from '../lib/repositories/LibraryRepository'
import { abortRequestsWithPrefix, deduplicatedFetchWithCallerAbort } from '../lib/requestManager'
import { getAppConfig } from '../lib/runtimeConfig'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'

let hasHydratedCountry = false
let hasManualCountrySelection = false

function hashStableString(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Centralized handler for user-initiated DB write errors.
 * Logs the error for debugging and shows a user-friendly toast.
 */
function handleDbWriteError(operation: string, toastKey: TranslationKey, error: unknown): void {
  if (!isAbortLikeError(error)) {
    warn(`[ExploreStore] Failed to ${operation}:`, error)
  }
  toast.errorKey(toastKey)
}

function requireCountryAtSave(country: string | undefined, operation: string): string | null {
  if (!country) {
    warn(`[ExploreStore] Rejecting ${operation}: missing countryAtSave`)
    return null
  }
  return country
}

function normalizeCountryOrUndefined(country: string | null | undefined): string | undefined {
  if (typeof country !== 'string') return undefined
  const normalized = country.trim().toLowerCase()
  return normalized || undefined
}

function resolveCountryAtSave(
  globalCountry: string,
  countryOverride: string | null | undefined,
  operation: string
): string | null {
  const hasOverride = countryOverride !== undefined
  const normalizedOverride = normalizeCountryOrUndefined(countryOverride)
  const resolvedCountry = hasOverride ? normalizedOverride : normalizeCountryCode(globalCountry)
  return requireCountryAtSave(resolvedCountry, operation)
}

interface ExploreState {
  country: string

  // Subscriptions
  subscriptions: Subscription[]
  subscriptionsLoaded: boolean

  // Favorites
  favorites: Favorite[]
  favoritesLoaded: boolean

  // Actions
  setCountry: (country: string) => void

  // Subscriptions
  loadSubscriptions: () => Promise<void>
  refreshSubscriptions: () => Promise<void>
  subscribe: (
    podcast: Podcast,
    signal?: AbortSignal,
    countryOverride?: string | null
  ) => Promise<void>
  bulkSubscribe: (podcasts: MinimalSubscription[], signal?: AbortSignal) => Promise<void>
  unsubscribe: (feedUrl: string, signal?: AbortSignal) => Promise<void>
  isSubscribed: (feedUrl: string) => boolean

  // Favorites
  loadFavorites: () => Promise<void>
  refreshFavorites: () => Promise<void>
  addFavorite: (
    podcast: {
      feedUrl?: string
      title?: string
      artwork?: string
      podcastItunesId?: string | number
    },
    episode: FavoriteEpisodeInput,
    signal?: AbortSignal,
    countryOverride?: string | null
  ) => Promise<void>
  removeFavorite: (key: string, signal?: AbortSignal) => Promise<void>
  isFavorited: (feedUrl: string, audioUrl: string, id?: string) => boolean
}

const SETTING_KEY_COUNTRY = 'explore_country'

function getDefaultCountry(): string {
  return getAppConfig().DEFAULT_COUNTRY
}

function hydrateCountryFromDb(): void {
  if (hasHydratedCountry) return
  hasHydratedCountry = true

  void LibraryRepository.getSetting(SETTING_KEY_COUNTRY)
    .then((country) => {
      // Do not let delayed hydration override a manual user selection.
      if (!country || hasManualCountrySelection) return
      const normalizedCountry = normalizeCountryCode(country)
      if (useExploreStore.getState().country === normalizedCountry) return
      useExploreStore.setState({ country: normalizedCountry })
    })
    .catch((err) => {
      if (!isAbortLikeError(err)) warn('[ExploreStore] Failed to hydrate country setting:', err)
    })
}

/** Test-only helper to reset module-scoped in-flight state between specs. */
export function __testOnlyResetExploreStoreFlags(): void {
  hasHydratedCountry = false
  hasManualCountrySelection = false
  abortRequestsWithPrefix('subscribe:')
  abortRequestsWithPrefix('unsubscribe:')
  abortRequestsWithPrefix('bulkSubscribe:')
  abortRequestsWithPrefix('favorite:')
  abortRequestsWithPrefix('removeFavorite:')
  abortRequestsWithPrefix('loadSubscriptions')
  abortRequestsWithPrefix('loadFavorites')
}

/**
 * Persistence Strategy (P1-c - Fully IDB):
 * - All persistent data now in IndexedDB:
 *   - Subscriptions/Favorites: IDB
 *   - audio/Subtitle files: IDB
 *   - Session progress: IDB
 *   - Settings (country): IDB
 */

export const useExploreStore = create<ExploreState>((set, get) => ({
  // Initial state
  country: getDefaultCountry(), // Hydrated from IDB on store initialization
  subscriptions: [],
  subscriptionsLoaded: false,
  favorites: [],
  favoritesLoaded: false,
  setCountry: (country) => {
    const normalizedCountry = normalizeCountryCode(country)
    hasManualCountrySelection = true
    if (get().country === normalizedCountry) return

    set({ country: normalizedCountry })
    void LibraryRepository.setSetting(SETTING_KEY_COUNTRY, normalizedCountry).catch((err) => {
      if (!isAbortLikeError(err)) warn('[ExploreStore] Failed to save setting:', err)
    })
  },

  // Subscriptions (IndexedDB)
  loadSubscriptions: async () => {
    if (get().subscriptionsLoaded) return

    return deduplicatedFetchWithCallerAbort('loadSubscriptions', undefined, async () => {
      try {
        const subs = await LibraryRepository.getAllSubscriptions()
        set({ subscriptions: subs, subscriptionsLoaded: true })
      } catch (error) {
        if (!isAbortLikeError(error)) warn('[ExploreStore] Failed to load subscriptions:', error)
        set({ subscriptionsLoaded: false })
      }
    })
  },
  refreshSubscriptions: async () => {
    // Refresh always re-reads, but coalesces concurrent calls
    return deduplicatedFetchWithCallerAbort('loadSubscriptions', undefined, async () => {
      try {
        const subs = await LibraryRepository.getAllSubscriptions()
        set({ subscriptions: subs, subscriptionsLoaded: true })
      } catch (error) {
        if (!isAbortLikeError(error)) warn('[ExploreStore] Failed to refresh subscriptions:', error)
      }
    })
  },
  subscribe: async (podcast, signal, countryOverride) => {
    if (signal?.aborted) return
    const countryAtSave = resolveCountryAtSave(
      get().country,
      countryOverride,
      'subscription persistence'
    )
    if (!countryAtSave) return

    const normalizedFeedUrl = normalizeFeedUrl(podcast.feedUrl ?? '')
    const dedupeKey = `subscribe:${normalizedFeedUrl}`

    const subData = {
      feedUrl: normalizedFeedUrl,
      title: podcast.title || '',
      author: podcast.author || '',
      artworkUrl: podcast.artwork || '',
      addedAt: Date.now(),
      podcastItunesId:
        podcast.podcastItunesId && String(podcast.podcastItunesId) !== '0'
          ? String(podcast.podcastItunesId)
          : undefined,
      countryAtSave,
    }

    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        // Check if already subscribed (deduplication via feedUrl)
        const existing = await LibraryRepository.getSubscriptionByFeedUrl(subData.feedUrl)
        if (sharedSignal.aborted) return

        if (existing) return
        const id = await LibraryRepository.addSubscription(subData)
        if (sharedSignal.aborted) return

        const newSub = { id, ...subData }
        set({ subscriptions: [newSub, ...get().subscriptions] })
      } catch (error) {
        if (sharedSignal.aborted) return
        handleDbWriteError('subscribe', 'toastSubscribeFailed', error)
      }
    })
  },
  bulkSubscribe: async (podcasts, signal) => {
    if (signal?.aborted) return
    const countryAtSave = requireCountryAtSave(
      normalizeCountryCode(get().country),
      'bulk subscription persistence'
    )
    if (!countryAtSave) return
    const subscriptionsToPersist = new Map<
      string,
      {
        feedUrl: string
        title: string
        author: string
        artworkUrl: string
        podcastItunesId: undefined
        countryAtSave: string
      }
    >()
    for (const podcast of podcasts) {
      const normalizedFeedUrl = normalizeFeedUrl(podcast.xmlUrl)
      if (!normalizedFeedUrl) continue
      if (!subscriptionsToPersist.has(normalizedFeedUrl)) {
        subscriptionsToPersist.set(normalizedFeedUrl, {
          feedUrl: normalizedFeedUrl,
          title: podcast.title,
          author: 'Imported',
          artworkUrl: '',
          podcastItunesId: undefined,
          countryAtSave,
        })
      }
    }

    if (subscriptionsToPersist.size === 0) return

    const sortedFeedUrls = Array.from(subscriptionsToPersist.keys()).sort()
    const bulkSignature = `${countryAtSave}\u001f${sortedFeedUrls.join('\u001f')}`
    const dedupeKey = `bulkSubscribe:${countryAtSave}:${sortedFeedUrls.length}:${hashStableString(
      bulkSignature
    )}`

    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        const existingLoaded = get().subscriptionsLoaded
        await LibraryRepository.bulkAddSubscriptionsIfMissing(
          Array.from(subscriptionsToPersist.values())
        )
        if (sharedSignal.aborted) return

        if (existingLoaded) {
          const subs = await LibraryRepository.getAllSubscriptions()
          if (sharedSignal.aborted) return
          set({ subscriptions: subs, subscriptionsLoaded: true })
        }
      } catch (error) {
        if (sharedSignal.aborted) return
        handleDbWriteError('bulk subscribe', 'toastSubscribeFailed', error)
      }
    })
  },
  unsubscribe: async (feedUrl, signal) => {
    if (signal?.aborted) return
    const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
    const dedupeKey = `unsubscribe:${normalizedFeedUrl}`

    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        await LibraryRepository.removeSubscriptionByFeedUrl(normalizedFeedUrl)
        if (sharedSignal.aborted) return
        const subs = get().subscriptions.filter((s) => s.feedUrl !== normalizedFeedUrl)
        set({ subscriptions: subs })
      } catch (error) {
        if (sharedSignal.aborted) return
        handleDbWriteError('unsubscribe', 'toastUnsubscribeFailed', error)
      }
    })
  },
  isSubscribed: (feedUrl) => {
    const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
    return get().subscriptions.some((s) => s.feedUrl === normalizedFeedUrl)
  },

  // Favorites (IndexedDB)
  loadFavorites: async () => {
    if (get().favoritesLoaded) return

    return deduplicatedFetchWithCallerAbort('loadFavorites', undefined, async () => {
      try {
        const favs = await LibraryRepository.getAllFavorites()
        set({ favorites: favs, favoritesLoaded: true })
      } catch (error) {
        if (!isAbortLikeError(error)) warn('[ExploreStore] Failed to load favorites:', error)
        set({ favoritesLoaded: false })
      }
    })
  },
  refreshFavorites: async () => {
    // Refresh always re-reads, but coalesces concurrent calls
    return deduplicatedFetchWithCallerAbort('loadFavorites', undefined, async () => {
      try {
        const favs = await LibraryRepository.getAllFavorites()
        set({ favorites: favs, favoritesLoaded: true })
      } catch (error) {
        if (!isAbortLikeError(error)) warn('[ExploreStore] Failed to refresh favorites:', error)
      }
    })
  },
  addFavorite: async (
    podcast: {
      feedUrl?: string
      title?: string
      artwork?: string
      podcastItunesId?: string | number
    },
    episode: FavoriteEpisodeInput,
    signal: AbortSignal | undefined,
    countryOverride: string | null | undefined
  ): Promise<void> => {
    if (signal?.aborted) return
    const countryAtSave = resolveCountryAtSave(
      get().country,
      countryOverride,
      'favorite persistence'
    )
    if (!countryAtSave) return

    const normalizedFeedUrl = normalizeFeedUrl(podcast.feedUrl ?? '')
    const key = `${normalizedFeedUrl}::${episode.audioUrl}`
    const dedupeKey = `favorite:${key}`

    const favData = {
      key,
      feedUrl: normalizedFeedUrl,
      podcastTitle: podcast.title || '',
      episodeTitle: episode.title || '',
      pubDate: episode.pubDate, // Date | undefined is allowed in Favorite
      audioUrl: episode.audioUrl || '',
      durationSeconds: episode.duration || 0,
      artworkUrl: podcast.artwork || '',
      addedAt: Date.now(),
      // Episode metadata for display
      episodeArtworkUrl: episode.artworkUrl,
      description: episode.description,
      episodeGuid: episode.episodeGuid,
      podcastItunesId:
        podcast.podcastItunesId && String(podcast.podcastItunesId) !== '0'
          ? String(podcast.podcastItunesId)
          : undefined,
      transcriptUrl: episode.transcriptUrl,
      countryAtSave,
    }

    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        // Check if already favorited (deduplication via key)
        const existing = await LibraryRepository.getFavoriteByKey(key)
        if (sharedSignal.aborted) return

        if (existing) return
        const id = await LibraryRepository.addFavorite(favData)
        if (sharedSignal.aborted) return

        const newFav = { id, ...favData }
        set({ favorites: [newFav, ...get().favorites] })
      } catch (error) {
        if (sharedSignal.aborted) return
        handleDbWriteError('add favorite', 'toastAddFavoriteFailed', error)
      }
    })
  },
  removeFavorite: async (key, signal) => {
    if (signal?.aborted) return
    const dedupeKey = `removeFavorite:${key}`

    return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
      try {
        await LibraryRepository.removeFavoriteByKey(key)
        if (sharedSignal.aborted) return
        const favs = get().favorites.filter((f) => f.key !== key)
        set({ favorites: favs })
      } catch (error) {
        if (sharedSignal.aborted) return
        handleDbWriteError('remove favorite', 'toastRemoveFavoriteFailed', error)
      }
    })
  },
  isFavorited: (feedUrl, audioUrl, id?: string) => {
    // 1. Precise Key Match (Primary)
    const key = `${normalizeFeedUrl(feedUrl)}::${audioUrl}`
    if (get().favorites.some((f) => f.key === key)) return true

    // 2. ID Match (For results from Discovery APIs before we have audioUrl)
    if (id) {
      return get().favorites.some((f) => String(f.episodeGuid) === String(id))
    }

    return false
  },
}))

hydrateCountryFromDb()
