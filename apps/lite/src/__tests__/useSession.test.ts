// src/__tests__/useSession.test.ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../hooks/useSession'
import { DB } from '../lib/dexieDb'
import { generateSessionId } from '../lib/session'
import { usePlayerStore } from '../store/playerStore'

// Mock DB
vi.mock('../lib/dexieDb', () => ({
  DB: {
    getLastPlaybackSession: vi.fn().mockResolvedValue(null),
    createPlaybackSession: vi.fn().mockResolvedValue('mock-session-id'),
    updatePlaybackSession: vi.fn().mockResolvedValue(undefined),
    getPlaybackSession: vi.fn().mockResolvedValue(null),
    getAudioBlob: vi.fn().mockResolvedValue(null),
    getSubtitle: vi.fn().mockResolvedValue(null),
    findLastSessionByUrl: vi.fn().mockResolvedValue(null),
    findLastSessionByTrackId: vi.fn().mockResolvedValue(null),
  },
}))

// Mock logger
vi.mock('../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

// Mock URL
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'mock-blob-url'),
  revokeObjectURL: vi.fn(),
})

// Mock sessionId generator
vi.mock('../lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/session')>()
  return {
    ...actual,
    generateSessionId: vi.fn(() => 'mock-session-id'),
  }
})

describe('useSession', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Reset player store
    usePlayerStore.setState({
      audioLoaded: false,
      subtitlesLoaded: false,
      progress: 0,
      duration: 0,
      sessionId: null,
      initializationStatus: 'idle',
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should trigger restoreSession on mount', async () => {
    const mockLastSession = {
      id: 'last-session-id',
      progress: 120,
      duration: 300,
      audioId: 'audio-1',
      subtitleId: null,
      audioFilename: 'test.mp3',
      subtitleFilename: '',
      createdAt: 0,
      lastPlayedAt: 0,
      hasAudioBlob: true,
      source: 'local' as const,
      title: 'Test',
      subtitleType: null,
      sizeBytes: 1000,
    }
    // biome-ignore lint/suspicious/noExplicitAny: Mocking DB return
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(mockLastSession as any)
    vi.mocked(DB.getAudioBlob).mockResolvedValue({
      id: 'audio-1',
      blob: new Blob(['audio']),
      filename: 'test.mp3',
      type: 'audio/mpeg',
      size: 5,
      storedAt: Date.now(),
    })

    renderHook(() => useSession())

    // Wait for restoreSession (which is async)
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(usePlayerStore.getState().initializationStatus).toBe('ready')
    expect(usePlayerStore.getState().sessionId).toBe('last-session-id')
    expect(usePlayerStore.getState().audioUrl).toBe('mock-blob-url')
  })

  it('should create a new playback session when audio is loaded after restoration', async () => {
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(undefined)

    renderHook(() => useSession())

    // 1. Wait for restoration to complete (to 'ready')
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(usePlayerStore.getState().initializationStatus).toBe('ready')

    // 2. Simulate loading audio manually
    act(() => {
      usePlayerStore.setState({ audioLoaded: true, duration: 300, audioTitle: 'Manual' })
    })

    // 3. Wait for new session creation
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(generateSessionId).toHaveBeenCalled()
    expect(usePlayerStore.getState().sessionId).toBe('mock-session-id')
    expect(DB.createPlaybackSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mock-session-id',
        duration: 300,
      })
    )
  })

  it('should still allow manual session creation if restoration fails', async () => {
    vi.mocked(DB.getLastPlaybackSession).mockRejectedValue(new Error('DB Error'))

    renderHook(() => useSession())

    // 1. Wait for restoration to fail
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(usePlayerStore.getState().initializationStatus).toBe('failed')

    // 2. Simulate loading audio manually
    act(() => {
      usePlayerStore.setState({ audioLoaded: true, duration: 300, audioTitle: 'Manual' })
    })

    // 3. Wait for new session creation
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    expect(generateSessionId).toHaveBeenCalled()
    expect(usePlayerStore.getState().sessionId).toBe('mock-session-id')
  })

  it('should save progress through store updateProgress action', async () => {
    usePlayerStore.setState({
      sessionId: 'active-session',
      progress: 0,
      duration: 100,
      initializationStatus: 'ready',
    })

    renderHook(() => useSession())

    act(() => {
      usePlayerStore.getState().updateProgress(10)
    })

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    expect(DB.updatePlaybackSession).toHaveBeenCalledTimes(1)
  })

  it('should save progress on unmount via saveProgressNow', async () => {
    usePlayerStore.setState({
      sessionId: 'unmount-session',
      progress: 50,
      duration: 200,
      initializationStatus: 'ready',
    })

    const { unmount } = renderHook(() => useSession())

    vi.mocked(DB.updatePlaybackSession).mockClear()
    unmount()

    expect(DB.updatePlaybackSession).toHaveBeenCalledWith(
      'unmount-session',
      expect.objectContaining({
        progress: 50,
      })
    )
  })
})
