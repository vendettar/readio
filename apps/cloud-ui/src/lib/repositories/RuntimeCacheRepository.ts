import type { RuntimeCacheEntry } from '../dexieDb'
import { DB } from '../dexieDb'

export const RuntimeCacheRepository = {
  getEntry<T = unknown>(key: string): Promise<(RuntimeCacheEntry & { data: T }) | undefined> {
    return DB.getRuntimeCacheEntry<T>(key)
  },

  setEntry<T = unknown>(entry: {
    key: string
    namespace: string
    data: T
    at: number
    ttlMs?: number
  }): Promise<void> {
    return DB.setRuntimeCacheEntry(entry)
  },

  deleteEntry(key: string): Promise<void> {
    return DB.deleteRuntimeCacheEntry(key)
  },
}
