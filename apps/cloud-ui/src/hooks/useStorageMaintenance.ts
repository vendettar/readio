// src/hooks/useStorageMaintenance.ts
// Hook for storage maintenance actions (delete session, clear cache, wipe all)

import { useCallback, useState } from 'react'
import { clearAllCredentials } from '../lib/db/credentialsRepository'
import { DB } from '../lib/dexieDb'
import { clearDiscoveryMemoryCache, runDiscoveryCacheMaintenance } from '../lib/discovery'
import { logError } from '../lib/logger'
import { bumpSettingsWriteEpoch, SETTINGS_STORAGE_KEY } from '../lib/schemas/settings'
import { clearDictCacheMemory } from '../lib/selection/dictCache'
import { toast } from '../lib/toast'

interface UseStorageMaintenanceOptions {
  reload: () => Promise<void>
}

export function useStorageMaintenance({ reload }: UseStorageMaintenanceOptions) {
  const [isClearing, setIsClearing] = useState(false)

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await DB.deletePlaybackSession(id)
        toast.successKey('toastDeleted')
        await reload()
      } catch (err) {
        logError('[useStorageMaintenance] Failed to delete session:', err)
        toast.errorKey('toastDeleteFailed')
      }
    },
    [reload]
  )

  const clearSessionCache = useCallback(
    async (id: string) => {
      try {
        const didClear = await DB.clearPlaybackSessionAudioCache(id)
        if (didClear) {
          toast.successKey('toastAudioRemoved')
          await reload()
        }
      } catch (err) {
        logError('[useStorageMaintenance] Failed to clear cache:', err)
        toast.errorKey('toastRemoveDownloadedAudioFailed')
      }
    },
    [reload]
  )

  const wipeAll = useCallback(async () => {
    setIsClearing(true)
    try {
      // 1. Bump epoch counters FIRST — this invalidates any in-flight
      //    async save (e.g. handleFieldBlur) that captured a stale epoch.
      bumpSettingsWriteEpoch()
      await clearAllCredentials()

      // 2. Clear all persistent storage
      await DB.clearAllData()
      clearDiscoveryMemoryCache()
      await runDiscoveryCacheMaintenance()
      await clearDictCacheMemory()
      localStorage.removeItem(SETTINGS_STORAGE_KEY)

      // 3. Best-effort cleanup for any legacy data
      localStorage.removeItem('readio-user-credentials')

      toast.successKey('toastAllDataCleared')
      await reload()
    } catch (err) {
      logError('[useStorageMaintenance] Failed to wipe all:', err)
      toast.errorKey('toastWipeFailed')
    } finally {
      setIsClearing(false)
    }
  }, [reload])

  const wipeAudioCache = useCallback(async () => {
    setIsClearing(true)
    try {
      await DB.clearAllAudioBlobs()
      toast.successKey('toastAudioRemoved')
      await reload()
    } catch (err) {
      logError('[useStorageMaintenance] Failed to wipe audio cache:', err)
      toast.errorKey('toastWipeFailed')
    } finally {
      setIsClearing(false)
    }
  }, [reload])

  return {
    deleteSession,
    clearSessionCache,
    wipeAll,
    wipeAudioCache,
    isClearing,
  }
}
