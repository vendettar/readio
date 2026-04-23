// src/__tests__/useSession.test.ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DB, type PlaybackSession } from '../../lib/dexieDb'
import { generateSessionId } from '../../lib/session'
import { __testOnlyResetExploreStoreFlags, useExploreStore } from '../../store/exploreStore'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useSession } from '../useSession'

// Mock DB
vi.mock('../../lib/dexieDb', () => ({
  DB: {
    getSetting: vi.fn().mockResolvedValue(null),
    getLastPlaybackSession: vi.fn().mockResolvedValue(null),
    createPlaybackSession: vi.fn().mockResolvedValue('mock-session-id'),
    upsertPlaybackSession: vi.fn().mockResolvedValue(undefined),
    updatePlaybackSession: vi.fn().mockResolvedValue(undefined),
    getPlaybackSession: vi.fn().mockResolvedValue(null),
    getAudioBlob: vi.fn().mockResolvedValue(null),
    getSubtitle: vi.fn().mockResolvedValue(null),
    findLastSessionByUrl: vi.fn().mockResolvedValue(null),
    findLastSessionByTrackId: vi.fn().mockResolvedValue(null),
  },
}))

// Mock logger
vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

// Mock URL static blob helpers while preserving URL constructor behavior
const NativeURL = globalThis.URL
class URLWithBlobMocks extends NativeURL {
  static createObjectURL = vi.fn(() => 'mock-blob-url')
  static revokeObjectURL = vi.fn()
}
vi.stubGlobal('URL', URLWithBlobMocks)

// Mock sessionId generator
vi.mock('../../lib/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/session')>()
  return {
    ...actual,
    generateSessionId: vi.fn(() => 'mock-session-id'),
  }
})

describe('useSession', () => {
  function makePlaybackSession(
    overrides: Partial<PlaybackSession> & Pick<PlaybackSession, 'id' | 'title' | 'source'>
  ): PlaybackSession {
    const base = {
      createdAt: 0,
      lastPlayedAt: 0,
      sizeBytes: 0,
      durationSeconds: 0,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: '',
      subtitleFilename: '',
      ...overrides,
    }
    if (base.source === 'explore') {
      return {
        ...base,
        source: 'explore',
        countryAtSave: base.countryAtSave ?? 'us',
      }
    }
    return {
      ...base,
      source: 'local',
      countryAtSave: undefined,
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    __testOnlyResetExploreStoreFlags()
    // Reset player store
    usePlayerStore.setState({
      audioLoaded: false,
      progress: 0,
      duration: 0,
      sessionId: null,
      initializationStatus: 'idle',
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
    })
    useExploreStore.setState({ country: 'us' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should trigger restoreSession on mount', async () => {
    const mockLastSession = makePlaybackSession({
      id: 'last-session-id',
      source: 'local',
      title: 'Test',
      progress: 120,
      durationSeconds: 300,
      audioId: 'audio-1',
      audioFilename: 'test.mp3',
      hasAudioBlob: true,
      sizeBytes: 1000,
    })
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(mockLastSession)
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
      await vi.runOnlyPendingTimersAsync()
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
      await vi.runOnlyPendingTimersAsync()
    })
    expect(usePlayerStore.getState().initializationStatus).toBe('ready')

    // 2. Simulate loading audio manually
    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        duration: 300,
        audioTitle: 'Manual',
        episodeMetadata: { countryAtSave: 'us' },
      })
    })

    // 3. Wait for new session creation
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(generateSessionId).toHaveBeenCalled()
    expect(usePlayerStore.getState().sessionId).toBe('mock-session-id')
    expect(DB.upsertPlaybackSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mock-session-id',
        durationSeconds: 300,
        countryAtSave: 'us',
      })
    )
  })

  it('normalizes audioUrl and podcastFeedUrl before lookup and persistence', async () => {
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(undefined)

    renderHook(() => useSession())

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        duration: 180,
        audioTitle: 'Manual',
        audioUrl: '  https://CDN.Example.com/audio.mp3?x=1  ',
        episodeMetadata: {
          countryAtSave: 'US',
          podcastFeedUrl: '  HTTPS://Example.COM:443/feed.xml#frag  ',
        },
      })
    })

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(DB.findLastSessionByUrl).toHaveBeenCalledWith('https://CDN.Example.com/audio.mp3?x=1')
    expect(DB.upsertPlaybackSession).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: 'https://CDN.Example.com/audio.mp3?x=1',
        podcastFeedUrl: 'https://example.com/feed.xml',
        countryAtSave: 'us',
      })
    )
  })

  it('uses originalAudioUrl when current audioUrl is a blob URL', async () => {
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(undefined)

    renderHook(() => useSession())

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        duration: 180,
        audioTitle: 'Downloaded Episode',
        audioUrl: 'blob:https://app.local/track-1',
        episodeMetadata: {
          countryAtSave: 'US',
          originalAudioUrl: ' https://cdn.example.com/podcast/ep-1.mp3 ',
          podcastFeedUrl: ' https://example.com/feed.xml ',
        },
      })
    })

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(DB.findLastSessionByUrl).toHaveBeenCalledWith('https://cdn.example.com/podcast/ep-1.mp3')
    expect(DB.upsertPlaybackSession).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: 'https://cdn.example.com/podcast/ep-1.mp3',
        podcastFeedUrl: 'https://example.com/feed.xml',
        countryAtSave: 'us',
      })
    )
  })

  it('rejects explore session persistence when countryAtSave is outside supported allowlist', async () => {
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(undefined)

    renderHook(() => useSession())

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        duration: 60,
        audioTitle: 'Manual',
        audioUrl: 'https://example.com/audio.mp3',
        episodeMetadata: {
          countryAtSave: 'xx',
        },
      })
    })

    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    expect(DB.upsertPlaybackSession).not.toHaveBeenCalled()
    expect(usePlayerStore.getState().sessionId).toBeNull() // Instruction 20260228-R6
  })

  it('should still allow manual session creation if restoration fails', async () => {
    vi.mocked(DB.getLastPlaybackSession).mockRejectedValue(new Error('DB Error'))

    renderHook(() => useSession())

    // 1. Wait for restoration to fail
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })
    expect(usePlayerStore.getState().initializationStatus).toBe('failed')

    // 2. Simulate loading audio manually
    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        duration: 300,
        audioTitle: 'Manual',
        episodeMetadata: { countryAtSave: 'us' },
      })
    })

    // 3. Wait for new session creation
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
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
      await vi.runOnlyPendingTimersAsync()
    })
    expect(DB.updatePlaybackSession).toHaveBeenCalled()
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

  it('restores saved progress when session is not complete', async () => {
    usePlayerStore.setState({
      sessionId: 'restore-session',
      progress: 0,
      duration: 300,
      initializationStatus: 'ready',
    })
    vi.mocked(DB.getPlaybackSession).mockResolvedValue({
      id: 'restore-session',
      progress: 120,
      durationSeconds: 300,
      source: 'local',
      title: 'Track',
      createdAt: 0,
      lastPlayedAt: 0,
      sizeBytes: 0,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      audioFilename: '',
      subtitleFilename: '',
    })

    const { result } = renderHook(() => useSession())
    const audio = document.createElement('audio')

    await act(async () => {
      await result.current.restoreProgress(audio)
    })

    expect(audio.currentTime).toBe(120)
    expect(usePlayerStore.getState().progress).toBe(120)
    expect(DB.updatePlaybackSession).not.toHaveBeenCalledWith('restore-session', { progress: 0 })
  })

  it('ignores stale restore results when session/audio identity changes mid-restore', async () => {
    usePlayerStore.setState({
      sessionId: 'restore-session-stale',
      progress: 0,
      duration: 300,
      audioUrl: 'https://example.com/old.mp3',
      initializationStatus: 'ready',
    })

    let resolvePlaybackSession:
      | ((value: PlaybackSession | PromiseLike<PlaybackSession | undefined> | undefined) => void)
      | undefined
    vi.mocked(DB.getPlaybackSession).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePlaybackSession = resolve
        })
    )

    const { result } = renderHook(() => useSession())
    const audio = document.createElement('audio')
    audio.src = 'https://example.com/old.mp3'

    const restorePromise = result.current.restoreProgress(audio)

    act(() => {
      usePlayerStore.setState({
        sessionId: 'restore-session-new',
        audioUrl: 'https://example.com/new.mp3',
      })
      audio.src = 'https://example.com/new.mp3'
    })

    await act(async () => {
      resolvePlaybackSession?.({
        id: 'restore-session-stale',
        progress: 180,
        durationSeconds: 300,
        source: 'local',
        title: 'Track',
        createdAt: 0,
        lastPlayedAt: 0,
        sizeBytes: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        audioFilename: '',
        subtitleFilename: '',
      })
      await restorePromise
    })

    expect(audio.currentTime).toBe(0)
    expect(usePlayerStore.getState().progress).toBe(0)
  })

  it('calls seekTo when an existing session is found during the findOrStartSession logic', async () => {
    // 1. Setup store with audio loaded but NO sessionId yet
    usePlayerStore.setState({
      audioLoaded: true,
      audioUrl: 'https://example.com/audio.mp3',
      initializationStatus: 'ready',
      sessionId: null,
      progress: 0,
    })

    const mockExistingSession = {
      id: 'existing-session-123',
      source: 'local' as const,
      title: 'Existing Session',
      progress: 45.5,
      durationSeconds: 100,
    }
    vi.mocked(DB.findLastSessionByUrl).mockResolvedValue(makePlaybackSession(mockExistingSession))

    const seekToSpy = vi.spyOn(usePlayerStore.getState(), 'seekTo')

    // 2. Render hook - this will trigger the findOrStartSession effect
    renderHook(() => useSession())

    // 3. Wait for async session lookup
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    // 4. Verify results
    expect(usePlayerStore.getState().sessionId).toBe('existing-session-123')
    expect(usePlayerStore.getState().progress).toBe(45.5)
    expect(seekToSpy).toHaveBeenCalledWith(45.5)

    seekToSpy.mockRestore()
  })

  it('resets near-complete session to start instead of restoring tail progress', async () => {
    usePlayerStore.setState({
      sessionId: 'completed-session',
      progress: 0,
      duration: 4289,
      initializationStatus: 'ready',
    })
    vi.mocked(DB.getPlaybackSession).mockResolvedValue({
      id: 'completed-session',
      progress: 4288.2,
      durationSeconds: 4289,
      source: 'local',
      title: 'Track',
      createdAt: 0,
      lastPlayedAt: 0,
      sizeBytes: 0,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      audioFilename: '',
      subtitleFilename: '',
    })
    vi.mocked(DB.updatePlaybackSession).mockResolvedValue()

    const { result } = renderHook(() => useSession())
    const audio = document.createElement('audio')

    await act(async () => {
      await result.current.restoreProgress(audio)
    })

    expect(audio.currentTime).toBe(0)
    expect(usePlayerStore.getState().progress).toBe(0)
    expect(DB.updatePlaybackSession).toHaveBeenCalledWith('completed-session', { progress: 0 })
  })
  it('should invalidate session creation if track switches but URL remains the same', async () => {
    // 1. Start with initial state
    usePlayerStore.setState({ initializationStatus: 'ready', sessionId: null })
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(undefined)
    vi.mocked(DB.getPlaybackSession).mockResolvedValue(undefined)

    // Setup a delay in findLastSessionByTrackId
    let resolveDb: (value: PlaybackSession | undefined) => void
    const dbPromise = new Promise<PlaybackSession | undefined>((resolve) => {
      resolveDb = resolve
    })
    vi.mocked(DB.findLastSessionByTrackId).mockImplementation(() => dbPromise)

    renderHook(() => useSession())

    // 2. Load Audio with track A
    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        audioUrl: 'http://shared.mp3',
        localTrackId: 'track-A',
      })
    })

    // Wait for the effect and the start of findOrStartSession
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(DB.getPlaybackSession).toHaveBeenCalledWith('local-track-track-A')

    // 3. SWITCH Track to B while DB is still working
    act(() => {
      usePlayerStore.setState({
        localTrackId: 'track-B',
      })
    })

    // 4. Resolve DB
    await act(async () => {
      resolveDb?.(undefined)
      await Promise.resolve()
    })

    // 5. Verify that NO session was created (the store sessionId remains null)
    expect(usePlayerStore.getState().sessionId).toBeNull()
    expect(DB.upsertPlaybackSession).not.toHaveBeenCalled()
  })

  it('handles upsertPlaybackSession failure without creating dirty memory state', async () => {
    // 1. Setup: restoration ready, no session
    usePlayerStore.setState({ initializationStatus: 'ready', sessionId: null })
    vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(undefined)

    // 2. Mock failure for upsert
    vi.mocked(DB.upsertPlaybackSession).mockRejectedValue(new Error('Persistent Write Failed'))

    renderHook(() => useSession())

    // Trigger restoration ready
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    // 3. Load Audio to trigger session creation
    act(() => {
      usePlayerStore.setState({
        audioLoaded: true,
        duration: 300,
        audioTitle: 'Manual',
        episodeMetadata: { countryAtSave: 'us' },
      })
    })

    // 4. Wait for attempted session creation
    await act(async () => {
      await vi.runOnlyPendingTimersAsync()
    })

    // 5. Assert: sessionId must NOT be set to the generated ID if DB write failed
    expect(usePlayerStore.getState().sessionId).toBeNull()
    expect(DB.upsertPlaybackSession).toHaveBeenCalled()
  })
})
