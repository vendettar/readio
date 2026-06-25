import type { ReadioDB } from './schema'
import type { RuntimeCacheEntry, Setting } from './types'

export function createSettingsRuntimeDbMethods(db: ReadioDB) {
  return {
    async getSetting(key: string): Promise<string | null> {
      const result = await db.settings.get(key)
      return result?.value ?? null
    },

    async setSetting(key: string, value: string): Promise<void> {
      const setting: Setting = {
        key,
        value,
        updatedAt: Date.now(),
      }
      await db.settings.put(setting)
    },

    async getRuntimeCacheEntry<T = unknown>(
      key: string
    ): Promise<(RuntimeCacheEntry & { data: T }) | undefined> {
      const entry = await db.runtime_cache.get(key)
      if (!entry) return undefined
      return entry as RuntimeCacheEntry & { data: T }
    },

    async setRuntimeCacheEntry<T = unknown>(entry: {
      key: string
      namespace: string
      data: T
      at: number
      ttlMs?: number
    }): Promise<void> {
      await db.runtime_cache.put(entry)
    },

    async deleteRuntimeCacheEntry(key: string): Promise<void> {
      await db.runtime_cache.delete(key)
    },

    async deleteRuntimeCacheEntries(keys: string[]): Promise<void> {
      if (keys.length === 0) return
      await db.runtime_cache.bulkDelete(keys)
    },

    async getRuntimeCacheEntriesByNamespace(namespace: string): Promise<RuntimeCacheEntry[]> {
      return db.runtime_cache.where('namespace').equals(namespace).toArray()
    },

    async getRuntimeCacheEntriesByNamespaces(namespaces: string[]): Promise<RuntimeCacheEntry[]> {
      if (namespaces.length === 0) return []
      return db.runtime_cache.where('namespace').anyOf(namespaces).toArray()
    },

    async clearRuntimeCacheByNamespaces(namespaces: string[]): Promise<void> {
      if (namespaces.length === 0) return
      await db.transaction('rw', [db.runtime_cache], async () => {
        const keys = await db.runtime_cache.where('namespace').anyOf(namespaces).primaryKeys()
        await db.runtime_cache.bulkDelete(keys)
      })
    },
  }
}
