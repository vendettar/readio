// src/hooks/useSettingsData.ts
// Hook for loading Settings page data

import { useCallback, useEffect, useState } from 'react'
import type { PlaybackSession } from '../lib/dexieDb'
import { logError } from '../lib/logger'
import { loadSettingsDataSnapshot, type StorageInfo } from '../lib/settingsDataService'

export function useSettingsData() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [sessions, setSessions] = useState<PlaybackSession[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const snapshot = await loadSettingsDataSnapshot()
      setStorageInfo(snapshot.storageInfo)
      setSessions(snapshot.sessions)
    } catch (err) {
      logError('[useSettingsData] Failed to load data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return {
    storageInfo,
    sessions,
    isLoading,
    reload,
  }
}
