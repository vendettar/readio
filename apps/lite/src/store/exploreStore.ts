// src/store/exploreStore.ts
import { create } from 'zustand'
import { normalizeCountryCode } from '../constants/app'
import type { Favorite, Subscription } from '../lib/dexieDb'
import discovery, { type Episode, type ParsedFeed, type Podcast } from '../lib/discovery'
import { normalizeFeedUrl } from '../lib/discovery/feedUrl'
import { logError } from '../lib/logger'
import type { MinimalSubscription } from '../lib/opmlParser'
import { LibraryRepository } from '../lib/repositories/LibraryRepository'
import { abortRequestsWithPrefix, deduplicatedFetchWithCallerAbort } from '../lib/requestManager'
import { getAppConfig } from '../lib/runtimeConfig'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'

// Abort controller management for explore requests
let searchAbortController: AbortController | null = null
let podcastAbortController: AbortController | null = null
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
  logError(`[ExploreStore] Failed to ${operation}:`, error)
  toast.errorKey(toastKey)
}

function requireCountryAtSave(country: string | undefined, operation: string): string | null {
  if (!country) {
    logError(`[ExploreStore] Rejecting ${operation}: missing countryAtSave`)
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

function abortSearch(): void {
  if (searchAbortController) {
    searchAbortController.abort()
    searchAbortController = null
  }
}

function abortPodcast(): void {
  if (podcastAbortController) {
    podcastAbortController.abort()
    podcastAbortController = null
  }
}

function abortAll(): void {
  abortSearch()
  abortPodcast()
  // Also abort any inflight requests via requestManager
  // Use the search URL prefix from config to cancel pending requests
  abortRequestsWithPrefix(`GET:${getAppConfig().DISCOVERY_SEARCH_URL}`)
}

function bindExternalAbortSignal(
  internalController: AbortController,
  externalSignal?: AbortSignal
): () => void {
  if (!externalSignal) return () => {}
  if (externalSignal.aborted) {
    internalController.abort()
    return () => {}
  }

  const onAbort = () => internalController.abort()
  externalSignal.addEventListener('abort', onAbort, { once: true })
  return () => externalSignal.removeEventListener('abort', onAbort)
}

export type ExploreView = 'search' | 'subscriptions' | 'favorites' | 'podcast' | 'episode'

interface ExploreState {
  // Modal state
  isOpen: boolean
  view: ExploreView

  // Search state
  searchQuery: string
  searchResults: Podcast[]
  searchLoading: boolean
  searchErrorKey: TranslationKey | null
  country: string

  // Podcast detail state
  selectedPodcast: Podcast | null
  podcastFeed: ParsedFeed | null
  podcastLoading: boolean
  podcastErrorKey: TranslationKey | null

  // Episode state
  selectedEpisode: Episode | null

  // Subscriptions
  subscriptions: Subscription[]
  subscriptionsLoaded: boolean

  // Favorites
  favorites: Favorite[]
  favoritesLoaded: boolean

  // Actions
  open: () => void
  close: () => void
  setView: (view: ExploreView) => void
  setSearchQuery: (query: string) => void
  setCountry: (country: string) => void

  // Search
  performSearch: (query: string, signal?: AbortSignal) => Promise<void>

  // Podcast
  selectPodcast: (podcast: Podcast, signal?: AbortSignal) => Promise<void>
  clearPodcast: () => void

  // Episode
  selectEpisode: (episode: Episode) => void
  clearEpisode: () => void

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
    podcast: Podcast,
    episode: Episode,
    signal?: AbortSignal,
    countryOverride?: string | null
  ) => Promise<void>
  removeFavorite: (key: string, signal?: AbortSignal) => Promise<void>
  isFavorited: (feedUrl: string, audioUrl: string, id?: string, providerId?: string) => boolean
  // Request ID counters for race condition prevention
  // Separate counters prevent unrelated operations from canceling each other
  searchRequestId: number // For search operations
  podcastRequestId: number // For podcast feed loading
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
    .catch((err) => logError('[ExploreStore] Failed to hydrate country setting:', err))
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
  isOpen: false,
  view: 'search',
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchErrorKey: null,
  country: getDefaultCountry(), // Hydrated from IDB on store initialization
  selectedPodcast: null,
  podcastFeed: null,
  podcastLoading: false,
  podcastErrorKey: null,
  selectedEpisode: null,
  subscriptions: [],
  subscriptionsLoaded: false,
  favorites: [],
  favoritesLoaded: false,
  searchRequestId: 0,
  podcastRequestId: 0,

  // Modal
  open: () => {
    set({ isOpen: true, view: 'search' })
    // Load data from IDB
    void get()
      .loadSubscriptions()
      .catch((err) => logError('[ExploreStore] Failed to load subscriptions on open:', err))
    void get()
      .loadFavorites()
      .catch((err) => logError('[ExploreStore] Failed to load favorites on open:', err))
  },
  close: () => {
    abortAll() // Abort all pending requests when closing modal
    set({
      isOpen: false,
      selectedPodcast: null,
      podcastFeed: null,
      selectedEpisode: null,
    })
  },
  setView: (view) => set({ view }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setCountry: (country) => {
    const normalizedCountry = normalizeCountryCode(country)
    hasManualCountrySelection = true
    if (get().country === normalizedCountry) return

    set({ country: normalizedCountry })
    void LibraryRepository.setSetting(SETTING_KEY_COUNTRY, normalizedCountry).catch((err) => {
      logError('[ExploreStore] Failed to save setting:', err)
    })
  },

  // Search
  performSearch: async (query, signal) => {
    // Abort previous search
    abortSearch()

    // Use incremental counter to avoid Date.now() collision
    const requestId = get().searchRequestId + 1
    set({ searchRequestId: requestId })

    if (!query.trim()) {
      set({ searchResults: [], searchErrorKey: null })
      return
    }

    searchAbortController = new AbortController()
    const internalSignal = searchAbortController.signal
    const unbindExternalAbort = bindExternalAbortSignal(searchAbortController, signal)

    set({ searchLoading: true, searchErrorKey: null })

    try {
      // Use state.country instead of hardcoded 'us'
      // Compose internal and external signals
      const results = await discovery.searchPodcasts(query, get().country, 30, internalSignal)
      if (get().searchRequestId !== requestId || internalSignal.aborted) return // Ignore stale response
      set({ searchResults: results, searchLoading: false })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (get().searchRequestId === requestId) {
          set({ searchLoading: false })
        }
        return
      }
      if (get().searchRequestId !== requestId || internalSignal.aborted) return // Ignore stale response
      logError('[ExploreStore] Search failed:', error)
      set({
        searchErrorKey: 'errorSearchFailed',
        searchLoading: false,
      })
    } finally {
      unbindExternalAbort()
    }
  },

  // Podcast
  selectPodcast: async (podcast, signal) => {
    // Abort previous podcast fetch
    abortPodcast()

    const requestId = get().podcastRequestId + 1
    set({
      selectedPodcast: podcast,
      view: 'podcast',
      podcastLoading: true,
      podcastErrorKey: null,
      podcastFeed: null,
      podcastRequestId: requestId,
    })

    if (!podcast.feedUrl) {
      set({ podcastErrorKey: 'errorPodcastUnavailable', podcastLoading: false })
      return
    }

    podcastAbortController = new AbortController()
    const internalSignal = podcastAbortController.signal
    const unbindExternalAbort = bindExternalAbortSignal(podcastAbortController, signal)

    try {
      const feed = await discovery.fetchPodcastFeed(podcast.feedUrl, internalSignal)
      if (get().podcastRequestId !== requestId || internalSignal.aborted) return // Ignore stale response
      set({ podcastFeed: feed, podcastLoading: false })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (get().podcastRequestId === requestId) {
          set({ podcastLoading: false })
        }
        return
      }
      if (get().podcastRequestId !== requestId || internalSignal.aborted) return // Ignore stale response
      logError('[ExploreStore] Failed to load podcast feed:', error)
      set({
        podcastErrorKey: 'errorLoadEpisodesFailed',
        podcastLoading: false,
      })
    } finally {
      unbindExternalAbort()
    }
  },
  clearPodcast: () =>
    set({
      selectedPodcast: null,
      podcastFeed: null,
      podcastErrorKey: null,
      view: 'search',
    }),

  // Episode
  selectEpisode: (episode) => set({ selectedEpisode: episode, view: 'episode' }),
  clearEpisode: () => set({ selectedEpisode: null, view: 'podcast' }),

  // Subscriptions (IndexedDB)
  loadSubscriptions: async () => {
    if (get().subscriptionsLoaded) return

    return deduplicatedFetchWithCallerAbort('loadSubscriptions', undefined, async () => {
      try {
        const subs = await LibraryRepository.getAllSubscriptions()
        set({ subscriptions: subs, subscriptionsLoaded: true })
      } catch (error) {
        logError('[ExploreStore] Failed to load subscriptions:', error)
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
        logError('[ExploreStore] Failed to refresh subscriptions:', error)
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
      title: podcast.collectionName ?? '',
      author: podcast.artistName ?? '',
      artworkUrl: podcast.artworkUrl600 || podcast.artworkUrl100 || '',
      addedAt: Date.now(),
      providerPodcastId:
        podcast.providerPodcastId && String(podcast.providerPodcastId) !== '0'
          ? String(podcast.providerPodcastId)
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
        providerPodcastId: undefined
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
          providerPodcastId: undefined,
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
        logError('[ExploreStore] Failed to load favorites:', error)
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
        logError('[ExploreStore] Failed to refresh favorites:', error)
      }
    })
  },
  addFavorite: async (podcast, episode, signal, countryOverride) => {
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
      podcastTitle: podcast.collectionName ?? '',
      episodeTitle: episode.title ?? '',
      pubDate: episode.pubDate, // Date | undefined is allowed in Favorite
      audioUrl: episode.audioUrl ?? '',
      durationSeconds: episode.duration ?? 0,
      artworkUrl: podcast.artworkUrl600 || podcast.artworkUrl100 || '',
      addedAt: Date.now(),
      // Episode metadata for display
      episodeArtworkUrl: episode.artworkUrl,
      description: episode.description,
      episodeId: episode.id,
      providerPodcastId:
        podcast.providerPodcastId && String(podcast.providerPodcastId) !== '0'
          ? String(podcast.providerPodcastId)
          : undefined,
      providerEpisodeId:
        episode.providerEpisodeId && String(episode.providerEpisodeId) !== '0'
          ? String(episode.providerEpisodeId)
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
  isFavorited: (feedUrl, audioUrl, id?: string, providerId?: string) => {
    // 1. Precise Key Match (Primary)
    const key = `${normalizeFeedUrl(feedUrl)}::${audioUrl}`
    if (get().favorites.some((f) => f.key === key)) return true

    // 2. ID Match (For results from Discovery APIs before we have audioUrl)
    if (id || providerId) {
      return get().favorites.some((f) => {
        const idMatch =
          id && (String(f.episodeId) === String(id) || String(f.providerEpisodeId) === String(id))
        const pIdMatch =
          providerId &&
          (String(f.providerEpisodeId) === String(providerId) ||
            String(f.episodeId) === String(providerId))
        return idMatch || pIdMatch
      })
    }

    return false
  },
}))

hydrateCountryFromDb()
