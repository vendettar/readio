import { useEffect, useState } from 'react'

// Singleton state to avoid multiple listeners
let currentOnline = typeof window !== 'undefined' ? window.navigator.onLine : true
const listeners = new Set<(online: boolean) => void>()
let timeoutId: number | null = null

if (typeof window !== 'undefined') {
  const handleStatusChange = () => {
    // Debounce status changes by 1s (aligned with documentation)
    if (timeoutId) window.clearTimeout(timeoutId)

    timeoutId = window.setTimeout(() => {
      currentOnline = window.navigator.onLine
      listeners.forEach((l) => {
        l(currentOnline)
      })
      timeoutId = null
    }, 1000)
  }

  window.addEventListener('online', handleStatusChange)
  window.addEventListener('offline', handleStatusChange)
}

/**
 * Hook to track browser online/offline status with stabilization.
 * Singleton implementation to prevent redundant event listeners.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(currentOnline)

  useEffect(() => {
    listeners.add(setIsOnline)
    return () => {
      listeners.delete(setIsOnline)
    }
  }, [])

  return { isOnline }
}
