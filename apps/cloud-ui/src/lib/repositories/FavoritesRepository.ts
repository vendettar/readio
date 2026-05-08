import type { Favorite } from '../dexieDb'
import { DB } from '../dexieDb'

export const FavoritesRepository = {
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
