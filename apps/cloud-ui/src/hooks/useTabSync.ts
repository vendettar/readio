import { useEffect } from 'react'
import { STORAGE_KEY_TAB_SYNC } from '../constants/storage'
import { createId } from '../lib/id'
import { usePlayerStore } from '../store/playerStore'

type TabSyncMessage = {
  type: 'PLAYING'
  senderId: string
  timestamp: number
}

const MAX_EVENT_AGE_MS = 2000
const SYNC_CHANNEL = STORAGE_KEY_TAB_SYNC

const isValidMessage = (payload: unknown): payload is TabSyncMessage => {
  if (!payload || typeof payload !== 'object') return false
  const data = payload as TabSyncMessage
  return (
    data.type === 'PLAYING' &&
    typeof data.senderId === 'string' &&
    typeof data.timestamp === 'number'
  )
}

export function useTabSync(): void {
  useEffect(() => {
    const tabId = createId()

    const shouldIgnore = (payload: TabSyncMessage): boolean => {
      if (payload.senderId === tabId) return true
      if (Date.now() - payload.timestamp > MAX_EVENT_AGE_MS) return true
      return false
    }

    const handleIncoming = (payload: TabSyncMessage) => {
      if (shouldIgnore(payload)) return
      const { isPlaying } = usePlayerStore.getState()
      if (!isPlaying) return
      usePlayerStore.getState().pause()
    }

    let channel: BroadcastChannel | null = null
    let teardownListener = () => {}
    let storageCleanupTimer: ReturnType<typeof setTimeout> | null = null

    // 1. Setup BroadcastChannel (Modern)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(SYNC_CHANNEL)
        const onMessage = (event: MessageEvent) => {
          if (!isValidMessage(event.data)) return
          handleIncoming(event.data)
        }
        channel.addEventListener('message', onMessage)
        teardownListener = () => {
          channel?.removeEventListener('message', onMessage)
          channel?.close()
        }
      } catch {
        channel = null
      }
    }

    // 2. Setup LocalStorage fallback (Legacy/Compatible)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SYNC_CHANNEL || !event.newValue) return
      try {
        const payload = JSON.parse(event.newValue)
        if (isValidMessage(payload)) {
          handleIncoming(payload)
        }
      } catch {
        // Ignore malformed storage values
      }
    }
    window.addEventListener('storage', onStorage)

    const broadcastPlaying = () => {
      const payload: TabSyncMessage = {
        type: 'PLAYING',
        senderId: tabId,
        timestamp: Date.now(),
      }

      if (channel) {
        channel.postMessage(payload)
      } else {
        // Fallback to storage key. We use a JSON string.
        // We add a random salt to ensure the value changes every time,
        // as storage events only fire on value changes.
        try {
          localStorage.setItem(SYNC_CHANNEL, JSON.stringify(payload))
          if (storageCleanupTimer) {
            clearTimeout(storageCleanupTimer)
          }
          // Cleanup immediately after a tiny delay so we don't pollute storage,
          // but long enough for other tabs to potentially catch it (though events are sync).
          storageCleanupTimer = setTimeout(() => {
            try {
              localStorage.removeItem(SYNC_CHANNEL)
            } catch {
              // Ignore cleanup failure
            }
            storageCleanupTimer = null
          }, 50)
        } catch {
          // Ignore fallback failures if storage is restricted
        }
      }
    }

    const unsubscribe = usePlayerStore.subscribe((state, prevState) => {
      const startedPlaying =
        prevState.status !== 'playing' && state.status === 'playing' && state.isPlaying
      if (startedPlaying) {
        broadcastPlaying()
      }
    })

    return () => {
      teardownListener()
      if (storageCleanupTimer) {
        clearTimeout(storageCleanupTimer)
        storageCleanupTimer = null
      }
      try {
        localStorage.removeItem(SYNC_CHANNEL)
      } catch {
        // Ignore cleanup failure
      }
      window.removeEventListener('storage', onStorage)
      unsubscribe()
    }
  }, [])
}
