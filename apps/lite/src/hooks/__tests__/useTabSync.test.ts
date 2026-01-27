import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTabSync } from '../useTabSync'

type Listener = (event: { data: unknown }) => void

class MockBroadcastChannel {
  private static channels = new Map<string, Set<MockBroadcastChannel>>()

  private listeners = new Set<Listener>()
  readonly name: string

  constructor(name: string) {
    this.name = name
    const set = MockBroadcastChannel.channels.get(name) ?? new Set()
    set.add(this)
    MockBroadcastChannel.channels.set(name, set)
  }

  postMessage(data: unknown) {
    const set = MockBroadcastChannel.channels.get(this.name)
    if (!set) return
    for (const channel of set) {
      if (channel === this) continue
      channel.emit({ data })
    }
  }

  addEventListener(_type: 'message', listener: Listener) {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'message', listener: Listener) {
    this.listeners.delete(listener)
  }

  close() {
    const set = MockBroadcastChannel.channels.get(this.name)
    if (set) {
      set.delete(this)
      if (set.size === 0) {
        MockBroadcastChannel.channels.delete(this.name)
      }
    }
    this.listeners.clear()
  }

  private emit(event: { data: unknown }) {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  static reset() {
    MockBroadcastChannel.channels.clear()
  }
}

describe('useTabSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
    usePlayerStore.setState({ isPlaying: false, status: 'paused' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    MockBroadcastChannel.reset()
  })

  it('pauses when another tab starts playing', () => {
    renderHook(() => useTabSync())

    act(() => {
      usePlayerStore.setState({ isPlaying: true, status: 'playing' })
    })

    const otherTab = new BroadcastChannel('readio_sync')

    act(() => {
      otherTab.postMessage({
        type: 'PLAYING',
        senderId: 'other-tab',
        timestamp: Date.now(),
      })
    })

    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(usePlayerStore.getState().status).toBe('paused')
    otherTab.close()
  })

  it('no-ops when the current tab is not playing', () => {
    renderHook(() => useTabSync())

    act(() => {
      usePlayerStore.setState({ isPlaying: false, status: 'paused' })
    })

    const otherTab = new BroadcastChannel('readio_sync')

    act(() => {
      otherTab.postMessage({
        type: 'PLAYING',
        senderId: 'other-tab',
        timestamp: Date.now(),
      })
    })

    expect(usePlayerStore.getState().isPlaying).toBe(false)
    expect(usePlayerStore.getState().status).toBe('paused')
    otherTab.close()
  })
})
