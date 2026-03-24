import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INIT_DEGRADED_REASON, useAppInitialization } from '../useAppInitialization'

const { mockExploreState, mockPlayerState } = vi.hoisted(() => ({
  mockExploreState: {
    loadSubscriptions: vi.fn(),
    loadFavorites: vi.fn(),
    subscriptionsLoaded: true,
    favoritesLoaded: true,
  },
  mockPlayerState: {
    restoreSession: vi.fn(),
    initializationStatus: 'ready',
  },
}))

vi.mock('../../store/exploreStore', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  useExploreStore: Object.assign((selector: any) => selector(mockExploreState), {
    getState: () => mockExploreState,
  }),
}))

vi.mock('../../store/playerStore', () => ({
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  usePlayerStore: Object.assign((selector: any) => selector(mockPlayerState), {
    getState: () => mockPlayerState,
  }),
}))

const checkStorageQuota = vi.fn()
const prunePlaybackHistory = vi.fn()
const runIntegrityCheck = vi.fn()
const runRemoteTranscriptCacheMaintenance = vi.fn()
const logError = vi.fn()

vi.mock('../../lib/storageQuota', () => ({
  checkStorageQuota: (options?: { mode?: 'silent' | 'user' }) => checkStorageQuota(options),
}))

vi.mock('../../lib/retention', () => ({
  prunePlaybackHistory: () => prunePlaybackHistory(),
  runIntegrityCheck: () => runIntegrityCheck(),
}))

vi.mock('../../lib/remoteTranscript', () => ({
  runRemoteTranscriptCacheMaintenance: () => runRemoteTranscriptCacheMaintenance(),
  getAsrSettingsSnapshot: vi.fn(() => ({
    asrProvider: 'groq',
    asrModel: 'whisper-large-v3',
  })),
}))

vi.mock('../../lib/logger', () => ({
  error: (...args: unknown[]) => logError(...args),
}))

describe('useAppInitialization', () => {
  beforeEach(() => {
    prunePlaybackHistory.mockReset()
    runIntegrityCheck.mockReset()
    runRemoteTranscriptCacheMaintenance.mockReset()
    logError.mockReset()

    runRemoteTranscriptCacheMaintenance.mockResolvedValue(undefined)

    // Reset default mock states
    mockExploreState.subscriptionsLoaded = true
    mockExploreState.favoritesLoaded = true
    mockPlayerState.initializationStatus = 'ready'
  })

  it('checks storage quota silently on boot', async () => {
    renderHook(() => useAppInitialization())

    await waitFor(() => {
      expect(checkStorageQuota).toHaveBeenCalledWith({ mode: 'silent' })
    })
  })

  it('continues retention and integrity when remote transcript maintenance fails', async () => {
    runRemoteTranscriptCacheMaintenance.mockRejectedValueOnce(new Error('maintenance failed'))

    renderHook(() => useAppInitialization())

    await waitFor(() => {
      expect(prunePlaybackHistory).toHaveBeenCalledTimes(1)
      expect(runIntegrityCheck).toHaveBeenCalledTimes(1)
      expect(runRemoteTranscriptCacheMaintenance).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(logError).toHaveBeenCalledWith(
        '[Init] Remote transcript cache maintenance failed',
        expect.any(Error)
      )
    })
  })

  it('sets degradation signal and logs when safety timeout is reached', async () => {
    vi.useFakeTimers()
    // Simulate slow restoration
    mockExploreState.subscriptionsLoaded = false
    mockExploreState.favoritesLoaded = false

    const { result } = renderHook(() => useAppInitialization())

    expect(result.current.isReady).toBe(false)
    expect(result.current.isInitializationDegraded).toBe(false)

    // Advance time by 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.isReady).toBe(true)
    expect(result.current.isInitializationDegraded).toBe(true)
    expect(result.current.degradedReason).toBe(INIT_DEGRADED_REASON.RESTORE_TIMEOUT)
    expect(logError).toHaveBeenCalledWith(
      '[Init] Initialization degraded: safety timeout reached',
      expect.objectContaining({ reason: INIT_DEGRADED_REASON.RESTORE_TIMEOUT })
    )

    vi.useRealTimers()
  })

  it('does NOT set degradation signal if initialized fast (before 3s)', async () => {
    vi.useFakeTimers()
    // Normal fast restoration
    mockExploreState.subscriptionsLoaded = true
    mockExploreState.favoritesLoaded = true
    mockPlayerState.initializationStatus = 'ready'

    const { result } = renderHook(() => useAppInitialization())

    expect(result.current.isReady).toBe(true)
    expect(result.current.isInitializationDegraded).toBe(false)

    // Advance time by 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(result.current.isReady).toBe(true)
    expect(result.current.isInitializationDegraded).toBe(false)
    expect(result.current.degradedReason).toBeNull()
    expect(logError).not.toHaveBeenCalledWith(
      '[Init] Initialization degraded: safety timeout reached',
      expect.anything()
    )

    vi.useRealTimers()
  })
})
