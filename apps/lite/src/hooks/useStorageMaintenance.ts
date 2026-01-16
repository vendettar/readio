// src/hooks/useStorageMaintenance.ts
// Hook for storage maintenance actions (delete session, clear cache, wipe all)

import { useCallback, useState } from 'react'
import { DB } from '../lib/dexieDb'
import { logError } from '../lib/logger'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'

interface UseStorageMaintenanceOptions {
  reload: () => Promise<void>
  t: (key: TranslationKey) => string
}

export function useStorageMaintenance({ reload, t }: UseStorageMaintenanceOptions) {
  const [isClearing, setIsClearing] = useState(false)

  const deleteSession = useCallback(
    async (id: string) => {
      try {
        await DB.deletePlaybackSession(id)
        toast.success(t('toastDeleted'))
        await reload()
      } catch (err) {
        logError('[useStorageMaintenance] Failed to delete session:', err)
        toast.error(t('toastDeleteFailed'))
      }
    },
    [reload, t]
  )

  const clearSessionCache = useCallback(
    async (id: string) => {
      try {
        const session = await DB.getPlaybackSession(id)
        if (session?.audioId) {
          await DB.deleteAudioBlob(session.audioId)
          await DB.updatePlaybackSession(id, { audioId: null, hasAudioBlob: false })
          toast.success(t('toastAudioRemoved'))
          await reload()
        }
      } catch (err) {
        logError('[useStorageMaintenance] Failed to clear cache:', err)
        toast.error(t('toastRemoveFavoriteFailed'))
      }
    },
    [reload, t]
  )

  const wipeAll = useCallback(async () => {
    setIsClearing(true)
    try {
      await DB.clearAllData()
      toast.success(t('toastAllDataCleared'))
      await reload()
    } catch (err) {
      logError('[useStorageMaintenance] Failed to wipe all:', err)
      toast.error(t('toastWipeFailed'))
    } finally {
      setIsClearing(false)
    }
  }, [reload, t])

  return {
    deleteSession,
    clearSessionCache,
    wipeAll,
    isClearing,
  }
}
