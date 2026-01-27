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

    if (!channel && typeof window !== 'undefined') {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY_TAB_SYNC || !event.newValue) return
        try {
          const payload = JSON.parse(event.newValue)
          if (!isValidMessage(payload)) return
          handleIncoming(payload)
        } catch {
          // Ignore malformed payloads
        }
      }
      window.addEventListener('storage', onStorage)
      teardownListener = () => {
        window.removeEventListener('storage', onStorage)
      }
    }

    const broadcastPlaying = () => {
      const payload: TabSyncMessage = {
        type: 'PLAYING',
        senderId: tabId,
        timestamp: Date.now(),
      }

      if (channel) {
        channel.postMessage(payload)
        return
      }

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY_TAB_SYNC, JSON.stringify(payload))
        } catch {
          // Ignore storage failures
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
      unsubscribe()
    }
  }, [])
}
