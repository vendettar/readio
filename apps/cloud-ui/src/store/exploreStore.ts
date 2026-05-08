// src/store/exploreStore.ts
import { create } from 'zustand'
import type { FavoriteEpisodeInput, FavoritePodcastInput } from '../lib/db/types'
import type { Favorite, Subscription } from '../lib/dexieDb'
import type { Podcast } from '../lib/discovery'
import { abortRequestsWithPrefix } from '../lib/requestManager'
import {
  __testOnlyResetExploreCountryState,
  getInitialExploreCountry,
  hydrateExploreCountry,
  persistExploreCountrySelection,
} from './exploreStoreCountry'
import { createExploreFavoriteActions } from './exploreStoreFavorites'
import { createExploreSubscriptionActions } from './exploreStoreSubscriptions'

interface ExploreState {
  country: string

  // Subscriptions
  subscriptions: Subscription[]
  subscriptionsLoaded: boolean

  // Favorites
  favorites: Favorite[]
  favoritesLoaded: boolean

  // Actions
  hydrateCountry: () => Promise<void>
  setCountry: (country: string) => void

  // Subscriptions
  loadSubscriptions: () => Promise<void>
  refreshSubscriptions: () => Promise<void>
  subscribe: (
    podcast: Podcast,
    signal: AbortSignal | undefined,
    countryAtSave: string
  ) => Promise<void>
  unsubscribe: (podcastItunesId: string, signal?: AbortSignal) => Promise<void>
  isSubscribed: (podcastItunesId: string) => boolean

  // Favorites
  loadFavorites: () => Promise<void>
  refreshFavorites: () => Promise<void>
  addFavorite: (
    podcast: FavoritePodcastInput,
    episode: FavoriteEpisodeInput,
    signal: AbortSignal | undefined,
    countryAtSave: string
  ) => Promise<void>
  removeFavorite: (key: string, signal?: AbortSignal) => Promise<void>
  isFavorited: (podcastItunesId: string, episodeGuid: string) => boolean
}

/** Test-only helper to reset module-scoped in-flight state between specs. */
export function __testOnlyResetExploreStoreFlags(): void {
  __testOnlyResetExploreCountryState()
  abortRequestsWithPrefix('subscribe:')
  abortRequestsWithPrefix('unsubscribe:')
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
  country: getInitialExploreCountry(),
  subscriptions: [],
  subscriptionsLoaded: false,
  favorites: [],
  favoritesLoaded: false,
  hydrateCountry: () =>
    hydrateExploreCountry({
      getState: () => ({ country: get().country }),
      setState: (partial) => set(partial),
    }),
  setCountry: (country) =>
    persistExploreCountrySelection(
      {
        getState: () => ({ country: get().country }),
        setState: (partial) => set(partial),
      },
      country
    ),
  ...createExploreSubscriptionActions(set, get),
  ...createExploreFavoriteActions(set, get),
}))
