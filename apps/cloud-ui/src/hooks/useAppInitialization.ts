import { useEffect, useRef, useState } from 'react'
import { error as logError } from '../lib/logger'
import { checkStorageQuota } from '../lib/storageQuota'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'

export const INIT_DEGRADED_REASON = {
  RESTORE_TIMEOUT: 'restore_timeout',
} as const
export type InitDegradedReason = (typeof INIT_DEGRADED_REASON)[keyof typeof INIT_DEGRADED_REASON]

/**
 * App-level initialization hook
 * Loads subscriptions and favorites once on app mount
 * Also manages session restoration
 *
 * Architecture: Each concern is in a separate effect so that unrelated
 * state changes (e.g. playerStatus) never re-trigger data loading, and
 * vice versa. With Promise Coalescing in each store, concurrent calls
 * are inherently safe, but separate effects prevent unnecessary work.
 */
export function useAppInitialization() {
  const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions)
  const loadFavorites = useExploreStore((s) => s.loadFavorites)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)
  const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded)
  const restoreSession = usePlayerStore((s) => s.restoreSession)
  const playerStatus = usePlayerStore((s) => s.initializationStatus)

  // 1. Load explore data (fire-and-forget, runs once on mount)
  //    Promise Coalescing inside each method guarantees idempotency.
  useEffect(() => {
    void loadSubscriptions()
    void loadFavorites()
  }, [loadSubscriptions, loadFavorites]) // Stable Zustand refs — effectively runs once

  // 2. Restore playback session (runs once when player is idle)
  useEffect(() => {
    if (playerStatus === 'idle') {
      void restoreSession()
    }
  }, [playerStatus, restoreSession])

  // 3. Background maintenance (runs exactly once on mount)
  const isPruned = useRef(false)
  const quotaChecked = useRef(false)
  useEffect(() => {
    if (!isPruned.current) {
      isPruned.current = true
      void import('../lib/retention')
        .then(({ prunePlaybackHistory, runIntegrityCheck }) => {
          const retentionTask = Promise.resolve().then(() => prunePlaybackHistory())
          const integrityTask = Promise.resolve().then(() => runIntegrityCheck())

          void Promise.allSettled([retentionTask, integrityTask]).then(
            ([retentionResult, integrityResult]) => {
              if (retentionResult.status === 'rejected') {
                logError('[Init] Retention prune failed', retentionResult.reason)
              }
              if (integrityResult.status === 'rejected') {
                logError('[Init] Integrity check failed', integrityResult.reason)
              }
            }
          )
        })
        .catch((err) => {
          logError('[Init] Retention module failed to load', err)
        })

      void import('../lib/remoteTranscript')
        .then(({ runRemoteTranscriptCacheMaintenance }) => {
          void Promise.resolve()
            .then(() => runRemoteTranscriptCacheMaintenance())
            .catch((err) => {
              logError('[Init] Remote transcript cache maintenance failed', err)
            })
        })
        .catch((err) => {
          logError('[Init] Remote transcript module failed to load', err)
        })
    }

    if (!quotaChecked.current) {
      quotaChecked.current = true
      void checkStorageQuota({ mode: 'silent' })
    }
  }, [])

  // Safety timeout: force ready after 3 seconds to prevent DB hangs from blocking the UI
  const [forceReady, setForceReady] = useState(false)
  const [isInitializationDegraded, setIsInitializationDegraded] = useState(false)
  const [degradedReason, setDegradedReason] = useState<InitDegradedReason | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      // 1. Read current readiness snapshot
      const currentExploreState = useExploreStore.getState()
      const currentPlayerState = usePlayerStore.getState()

      const isCurrentlyReady =
        currentExploreState.subscriptionsLoaded &&
        currentExploreState.favoritesLoaded &&
        currentPlayerState.initializationStatus !== 'restoring'

      // 2. If degraded, execute side effects directly
      if (!isCurrentlyReady) {
        logError('[Init] Initialization degraded: safety timeout reached', {
          reason: INIT_DEGRADED_REASON.RESTORE_TIMEOUT,
          playerStatus: currentPlayerState.initializationStatus,
          subscriptionsLoaded: currentExploreState.subscriptionsLoaded,
          favoritesLoaded: currentExploreState.favoritesLoaded,
        })
        setIsInitializationDegraded(true)
        setDegradedReason(INIT_DEGRADED_REASON.RESTORE_TIMEOUT)
      }

      // 3. Force ready once
      setForceReady(true)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  // Ready when both explore data and player session are initialized OR after timeout
  const isReady =
    forceReady || (subscriptionsLoaded && favoritesLoaded && playerStatus !== 'restoring')
  const isHydrated = subscriptionsLoaded && favoritesLoaded

  return {
    isReady,
    isHydrated,
    isInitializationDegraded,
    degradedReason,
  }
}
