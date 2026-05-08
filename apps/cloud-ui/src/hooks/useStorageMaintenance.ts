// src/hooks/useStorageMaintenance.ts
// Hook for storage maintenance actions (delete session, clear cache, wipe all)

import { useCallback, useState } from 'react'
import { logError } from '../lib/logger'
import {
  clearPlaybackSessionAudioCacheForMaintenance,
  deletePlaybackSessionForMaintenance,
  wipeAllPersistentStorage,
  wipeStoredAudioCache,
} from '../lib/storageMaintenanceService'
import { toast } from '../lib/toast'

interface UseStorageMaintenanceOptions {
  reload: () => Promise<void>
}

export function useStorageMaintenance({ reload }: UseStorageMaintenanceOptions) {
  const [isClearing, setIsClearing] = useState(false)

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await deletePlaybackSessionForMaintenance(id)
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
        const didClear = await clearPlaybackSessionAudioCacheForMaintenance(id)
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
      await wipeAllPersistentStorage()
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
      await wipeStoredAudioCache()
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
