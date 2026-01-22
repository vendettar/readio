// src/hooks/useStorageMaintenance.ts
// Hook for storage maintenance actions (delete session, clear cache, wipe all)

import { useCallback, useState } from 'react'
import { DB } from '../lib/dexieDb'
import { logError } from '../lib/logger'
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
        const session = await DB.getPlaybackSession(id)
        if (session?.audioId) {
          await DB.deleteAudioBlob(session.audioId)
          await DB.updatePlaybackSession(id, { audioId: null, hasAudioBlob: false })
          toast.successKey('toastAudioRemoved')
          await reload()
        }
      } catch (err) {
        logError('[useStorageMaintenance] Failed to clear cache:', err)
        toast.errorKey('toastRemoveFavoriteFailed')
      }
    },
    [reload]
  )

  const wipeAll = useCallback(async () => {
    setIsClearing(true)
    try {
      await DB.clearAllData()
      toast.successKey('toastAllDataCleared')
      await reload()
    } catch (err) {
      logError('[useStorageMaintenance] Failed to wipe all:', err)
      toast.errorKey('toastWipeFailed')
    } finally {
      setIsClearing(false)
    }
  }, [reload])

  return {
    deleteSession,
    clearSessionCache,
    wipeAll,
    isClearing,
  }
}
