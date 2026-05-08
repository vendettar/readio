import { buildFavoriteKey, favoriteMatchesIdentity } from '../lib/db/favoriteIdentity'
import type { FavoriteEpisodeInput, FavoritePodcastInput } from '../lib/db/types'
import type { Favorite } from '../lib/dexieDb'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import { FavoritesRepository } from '../lib/repositories/FavoritesRepository'
import { deduplicatedFetchWithCallerAbort } from '../lib/requestManager'
import {
  prependExploreFavorite,
  removeExploreFavoriteByKey,
  replaceExploreFavorites,
} from './exploreStoreMutations'
import {
  buildFavoritePersistenceInput,
  handleExploreDbWriteError,
  normalizeCountryAtSaveForExplore,
} from './exploreStorePersistence'

type ExploreFavoriteState = {
  favorites: Favorite[]
  favoritesLoaded: boolean
}

type SetExploreFavoriteState = (partial: Partial<ExploreFavoriteState>) => void

type GetExploreFavoriteState = () => ExploreFavoriteState

export function createExploreFavoriteActions(
  set: SetExploreFavoriteState,
  get: GetExploreFavoriteState
): {
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
} {
  return {
    loadFavorites: async () => {
      if (get().favoritesLoaded) return

      return deduplicatedFetchWithCallerAbort('loadFavorites', undefined, async () => {
        try {
          const favorites = await FavoritesRepository.getAllFavorites()
          set({
            favorites: replaceExploreFavorites(favorites),
            favoritesLoaded: true,
          })
        } catch (error) {
          if (!isAbortLikeError(error)) warn('[ExploreStore] Failed to load favorites:', error)
          set({ favoritesLoaded: false })
        }
      })
    },

    refreshFavorites: async () => {
      return deduplicatedFetchWithCallerAbort('loadFavorites', undefined, async () => {
        try {
          const favorites = await FavoritesRepository.getAllFavorites()
          set({
            favorites: replaceExploreFavorites(favorites),
            favoritesLoaded: true,
          })
        } catch (error) {
          if (!isAbortLikeError(error)) warn('[ExploreStore] Failed to refresh favorites:', error)
        }
      })
    },

    addFavorite: async (podcast, episode, signal, countryAtSave): Promise<void> => {
      if (signal?.aborted) return

      const normalizedCountryAtSave = normalizeCountryAtSaveForExplore(
        countryAtSave,
        'favorite persistence'
      )
      if (!normalizedCountryAtSave) return

      const favData = buildFavoritePersistenceInput(podcast, episode, normalizedCountryAtSave)
      if (!favData) return

      const dedupeKey = `favorite:${favData.key}`

      return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
        try {
          const existing = await FavoritesRepository.getFavoriteByKey(favData.key)
          if (sharedSignal.aborted) return

          if (existing) return
          const id = await FavoritesRepository.addFavorite(favData)
          if (sharedSignal.aborted) return

          set({
            favorites: prependExploreFavorite(get().favorites, {
              id,
              ...favData,
            }),
          })
        } catch (error) {
          if (sharedSignal.aborted) return
          handleExploreDbWriteError('add favorite', 'toastAddFavoriteFailed', error)
        }
      })
    },

    removeFavorite: async (key, signal) => {
      if (signal?.aborted) return

      const dedupeKey = `removeFavorite:${key}`

      return deduplicatedFetchWithCallerAbort(dedupeKey, signal, async (sharedSignal) => {
        try {
          await FavoritesRepository.removeFavoriteByKey(key)
          if (sharedSignal.aborted) return

          set({
            favorites: removeExploreFavoriteByKey(get().favorites, key),
          })
        } catch (error) {
          if (sharedSignal.aborted) return
          handleExploreDbWriteError('remove favorite', 'toastRemoveFavoriteFailed', error)
        }
      })
    },

    isFavorited: (podcastItunesId, episodeGuid) => {
      const identityKey = buildFavoriteKey(podcastItunesId, episodeGuid)
      if (!identityKey) return false

      return get().favorites.some((favorite) =>
        favoriteMatchesIdentity(favorite, {
          podcastItunesId,
          episodeGuid,
        })
      )
    },
  }
}
