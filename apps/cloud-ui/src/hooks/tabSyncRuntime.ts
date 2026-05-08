import { STORAGE_KEY_TAB_SYNC } from '../constants/storage'

export type TabSyncMessage = {
  type: 'PLAYING'
  senderId: string
  timestamp: number
}

export interface TabSyncTransport {
  postPlaying: (senderId: string) => void
  destroy: () => void
}

const MAX_EVENT_AGE_MS = 2000
const SYNC_CHANNEL = STORAGE_KEY_TAB_SYNC
const STORAGE_CLEANUP_DELAY_MS = 50

export function isValidTabSyncMessage(payload: unknown): payload is TabSyncMessage {
  if (!payload || typeof payload !== 'object') return false
  const data = payload as TabSyncMessage
  return (
    data.type === 'PLAYING' &&
    typeof data.senderId === 'string' &&
    typeof data.timestamp === 'number'
  )
}

export function shouldIgnoreTabSyncMessage(
  payload: TabSyncMessage,
  tabId: string,
  now = Date.now()
): boolean {
  if (payload.senderId === tabId) return true
  if (now - payload.timestamp > MAX_EVENT_AGE_MS) return true
  return false
}

export function createTabSyncTransport(input: {
  tabId: string
  onIncomingPlaying: () => void
}): TabSyncTransport {
  const { tabId, onIncomingPlaying } = input

  const handleIncoming = (payload: TabSyncMessage) => {
    if (shouldIgnoreTabSyncMessage(payload, tabId)) return
    onIncomingPlaying()
  }

  let channel: BroadcastChannel | null = null
  let teardownListener = () => {}
  let storageCleanupTimer: ReturnType<typeof setTimeout> | null = null

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL)
      const onMessage = (event: MessageEvent) => {
        if (!isValidTabSyncMessage(event.data)) return
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

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SYNC_CHANNEL || !event.newValue) return
    try {
      const payload = JSON.parse(event.newValue)
      if (isValidTabSyncMessage(payload)) {
        handleIncoming(payload)
      }
    } catch {
      // Ignore malformed storage values
    }
  }
  window.addEventListener('storage', onStorage)

  return {
    postPlaying: (senderId: string) => {
      const payload: TabSyncMessage = {
        type: 'PLAYING',
        senderId,
        timestamp: Date.now(),
      }

      if (channel) {
        channel.postMessage(payload)
        return
      }

      try {
        localStorage.setItem(SYNC_CHANNEL, JSON.stringify(payload))
        if (storageCleanupTimer) {
          clearTimeout(storageCleanupTimer)
        }
        storageCleanupTimer = setTimeout(() => {
          try {
            localStorage.removeItem(SYNC_CHANNEL)
          } catch {
            // Ignore cleanup failure
          }
          storageCleanupTimer = null
        }, STORAGE_CLEANUP_DELAY_MS)
      } catch {
        // Ignore fallback failures if storage is restricted
      }
    },
    destroy: () => {
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
    },
  }
}
