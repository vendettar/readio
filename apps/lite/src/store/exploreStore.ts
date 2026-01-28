// src/store/exploreStore.ts
import { create } from 'zustand'
import type { Favorite, Subscription } from '../lib/dexieDb'
import { DB, db } from '../lib/dexieDb'
import discovery, { type Episode, type ParsedFeed, type Podcast } from '../lib/discovery'
import { createId } from '../lib/id'
import { logError } from '../lib/logger'
import type { MinimalSubscription } from '../lib/opmlParser'
import { abortRequestsWithPrefix } from '../lib/requestManager'
import { getAppConfig } from '../lib/runtimeConfig'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'

// Abort controller management for explore requests
let searchAbortController: AbortController | null = null
let podcastAbortController: AbortController | null = null

/**
 * Centralized handler for user-initiated DB write errors.
 * Logs the error for debugging and shows a user-friendly toast.
 */
function handleDbWriteError(operation: string, toastKey: TranslationKey, error: unknown): void {
  logError(`[ExploreStore] Failed to ${operation}:`, error)
  toast.errorKey(toastKey)
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
  performSearch: (query: string) => Promise<void>

  // Podcast
  selectPodcast: (podcast: Podcast) => Promise<void>
  clearPodcast: () => void

  // Episode
  selectEpisode: (episode: Episode) => void
  clearEpisode: () => void

  // Subscriptions
  loadSubscriptions: () => Promise<void>
  refreshSubscriptions: () => Promise<void>
  subscribe: (podcast: Podcast) => Promise<void>
  bulkSubscribe: (podcasts: MinimalSubscription[]) => Promise<void>
  unsubscribe: (feedUrl: string) => Promise<void>
  isSubscribed: (feedUrl: string) => boolean

  // Favorites
  loadFavorites: () => Promise<void>
  refreshFavorites: () => Promise<void>
  addFavorite: (podcast: Podcast, episode: Episode) => Promise<void>
  removeFavorite: (key: string) => Promise<void>
  isFavorited: (feedUrl: string, audioUrl: string) => boolean
}

const SETTING_KEY_COUNTRY = 'explore_country'

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
  country: getAppConfig().DEFAULT_COUNTRY, // Will be loaded from IDB on open
  selectedPodcast: null,
  podcastFeed: null,
  podcastLoading: false,
  podcastErrorKey: null,
  selectedEpisode: null,
  subscriptions: [],
  subscriptionsLoaded: false,
  favorites: [],
  favoritesLoaded: false,

  // Modal
  open: () => {
    set({ isOpen: true, view: 'search' })
    // Load settings and data from IDB
    DB.getSetting(SETTING_KEY_COUNTRY).then((country) => {
      if (country) set({ country })
    })
    get().loadSubscriptions()
    get().loadFavorites()
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
    set({ country })
    DB.setSetting(SETTING_KEY_COUNTRY, country).catch((err) => {
      logError('[ExploreStore] Failed to save setting:', err)
    })
  },

  // Search
  performSearch: async (query) => {
    // Abort previous search
    abortSearch()

    if (!query.trim()) {
      set({ searchResults: [], searchErrorKey: null })
      return
    }

    searchAbortController = new AbortController()
    const signal = searchAbortController.signal

    set({ searchLoading: true, searchErrorKey: null })

    try {
      const results = await discovery.searchPodcasts(query, 'us', 30, signal)
      set({ searchResults: results, searchLoading: false })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Aborted, don't update state
        return
      }
      logError('[ExploreStore] Search failed:', error)
      set({
        searchErrorKey: 'errorSearchFailed',
        searchLoading: false,
      })
    }
  },

  // Podcast
  selectPodcast: async (podcast) => {
    // Abort previous podcast fetch
    abortPodcast()

    set({
      selectedPodcast: podcast,
      view: 'podcast',
      podcastLoading: true,
      podcastErrorKey: null,
      podcastFeed: null,
    })

    if (!podcast.feedUrl) {
      set({ podcastErrorKey: 'errorPodcastUnavailable', podcastLoading: false })
      return
    }

    podcastAbortController = new AbortController()
    const signal = podcastAbortController.signal

    try {
      const feed = await discovery.fetchPodcastFeed(podcast.feedUrl, signal)
      set({ podcastFeed: feed, podcastLoading: false })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Aborted, don't update state
        return
      }
      logError('[ExploreStore] Failed to load podcast feed:', error)
      set({
        podcastErrorKey: 'errorLoadEpisodesFailed',
        podcastLoading: false,
      })
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
    try {
      const subs = await DB.getAllSubscriptions()
      set({ subscriptions: subs, subscriptionsLoaded: true })
    } catch (error) {
      logError('[ExploreStore] Failed to load subscriptions:', error)
      set({ subscriptionsLoaded: true })
    }
  },
  refreshSubscriptions: async () => {
    try {
      const subs = await DB.getAllSubscriptions()
      set({ subscriptions: subs, subscriptionsLoaded: true })
    } catch (error) {
      logError('[ExploreStore] Failed to refresh subscriptions:', error)
      set({ subscriptionsLoaded: true })
    }
  },
  subscribe: async (podcast) => {
    const subData = {
      feedUrl: podcast.feedUrl ?? '',
      title: podcast.collectionName ?? '',
      author: podcast.artistName ?? '',
      artworkUrl: podcast.artworkUrl600 || podcast.artworkUrl100 || '',
      addedAt: Date.now(),
      providerPodcastId: podcast.providerPodcastId?.toString(),
    }
    try {
      // Check if already subscribed (deduplication via feedUrl)
      const existing = await DB.getSubscriptionByFeedUrl(subData.feedUrl)
      if (existing) {
        // Already subscribed, skip
        return
      }
      const id = await DB.addSubscription(subData)
      const newSub = { id, ...subData }
      // Prepend new subscription to maintain reverse-chronological order
      set({ subscriptions: [newSub, ...get().subscriptions] })
    } catch (error) {
      handleDbWriteError('subscribe', 'toastSubscribeFailed', error)
    }
  },
  bulkSubscribe: async (podcasts) => {
    try {
      const feedUrls = podcasts.map((p) => p.xmlUrl).filter(Boolean)
      if (feedUrls.length === 0) return

      const existingLoaded = get().subscriptionsLoaded
      await db.transaction('rw', db.subscriptions, async () => {
        const existing = await db.subscriptions.where('feedUrl').anyOf(feedUrls).toArray()
        const existingUrls = new Set(existing.map((s) => s.feedUrl))
        const now = Date.now()

        const newSubs: Subscription[] = podcasts
          .filter((p) => !existingUrls.has(p.xmlUrl))
          .map((p) => ({
            id: createId(),
            feedUrl: p.xmlUrl,
            title: p.title,
            author: 'Imported',
            artworkUrl: '',
            addedAt: now,
            providerPodcastId: undefined,
          }))

        if (newSubs.length > 0) {
          await db.subscriptions.bulkPut(newSubs)
        }
      })
      if (existingLoaded) {
        const subs = await DB.getAllSubscriptions()
        set({ subscriptions: subs, subscriptionsLoaded: true })
      }
    } catch (error) {
      handleDbWriteError('bulk subscribe', 'toastSubscribeFailed', error)
    }
  },
  unsubscribe: async (feedUrl) => {
    try {
      await DB.removeSubscriptionByFeedUrl(feedUrl)
      const subs = get().subscriptions.filter((s) => s.feedUrl !== feedUrl)
      set({ subscriptions: subs })
    } catch (error) {
      handleDbWriteError('unsubscribe', 'toastUnsubscribeFailed', error)
    }
  },
  isSubscribed: (feedUrl) => {
    return get().subscriptions.some((s) => s.feedUrl === feedUrl)
  },

  // Favorites (IndexedDB)
  loadFavorites: async () => {
    if (get().favoritesLoaded) return
    try {
      const favs = await DB.getAllFavorites()
      set({ favorites: favs, favoritesLoaded: true })
    } catch (error) {
      logError('[ExploreStore] Failed to load favorites:', error)
      set({ favoritesLoaded: true })
    }
  },
  refreshFavorites: async () => {
    try {
      const favs = await DB.getAllFavorites()
      set({ favorites: favs, favoritesLoaded: true })
    } catch (error) {
      logError('[ExploreStore] Failed to refresh favorites:', error)
      set({ favoritesLoaded: true })
    }
  },
  addFavorite: async (podcast, episode) => {
    const key = `${podcast.feedUrl}::${episode.audioUrl}`
    const favData = {
      key,
      feedUrl: podcast.feedUrl ?? '',
      podcastTitle: podcast.collectionName ?? '',
      episodeTitle: episode.title ?? '',
      pubDate: episode.pubDate, // Date | undefined is allowed in Favorite
      audioUrl: episode.audioUrl ?? '',
      duration: episode.duration ?? 0,
      artworkUrl: podcast.artworkUrl600 || podcast.artworkUrl100 || '',
      addedAt: Date.now(),
      // Episode metadata for display
      description: episode.description,
      episodeArtworkUrl: episode.artworkUrl,
      episodeId: episode.id,
    }
    try {
      // Check if already favorited (deduplication via key)
      const existing = await DB.getFavoriteByKey(key)
      if (existing) {
        // Already favorited, skip
        return
      }
      const id = await DB.addFavorite(favData)
      const newFav = { id, ...favData }
      // Prepend new favorite to maintain reverse-chronological order
      set({ favorites: [newFav, ...get().favorites] })
    } catch (error) {
      handleDbWriteError('add favorite', 'toastAddFavoriteFailed', error)
    }
  },
  removeFavorite: async (key) => {
    try {
      await DB.removeFavoriteByKey(key)
      const favs = get().favorites.filter((f) => f.key !== key)
      set({ favorites: favs })
    } catch (error) {
      handleDbWriteError('remove favorite', 'toastRemoveFavoriteFailed', error)
    }
  },
  isFavorited: (feedUrl, audioUrl) => {
    const key = `${feedUrl}::${audioUrl}`
    return get().favorites.some((f) => f.key === key)
  },
}))
