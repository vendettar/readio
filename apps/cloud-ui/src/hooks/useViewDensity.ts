import { useCallback, useEffect, useState } from 'react'
import type { ViewDensity } from '../components/Files/types'
import { warn as logWarn } from '../lib/logger'
import { useFilesStore } from '../store/filesStore'

/**
 * Hook to manage and persist view density preference.
 * @param storageKey The database key for storing the density preference.
 * @param defaultDensity The fallback density if none is stored.
 */
export function useViewDensity(storageKey: string, defaultDensity: ViewDensity = 'comfortable') {
  const [density, setDensity] = useState<ViewDensity>(defaultDensity)
  const getSetting = useFilesStore((state) => state.getSetting)
  const setSetting = useFilesStore((state) => state.setSetting)

  useEffect(() => {
    const loadDensity = async () => {
      try {
        const saved = await getSetting(storageKey)
        if (saved === 'comfortable' || saved === 'compact') {
          setDensity(saved)
        }
      } catch (err) {
        logWarn(`[useViewDensity] Failed to load ${storageKey}`, err)
      }
    }
    void loadDensity()
  }, [getSetting, storageKey])

  const handleDensityChange = useCallback(
    async (value: ViewDensity) => {
      setDensity(value)
      try {
        await setSetting(storageKey, value)
      } catch (err) {
        logWarn(`[useViewDensity] Failed to persist ${storageKey}`, err)
      }
    },
    [setSetting, storageKey]
  )

  return {
    density,
    handleDensityChange,
  }
}
