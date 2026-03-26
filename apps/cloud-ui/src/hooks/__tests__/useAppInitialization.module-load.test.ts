import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const checkStorageQuota = vi.fn()
const prunePlaybackHistory = vi.fn()
const runIntegrityCheck = vi.fn()
const logError = vi.fn()

async function loadHookWithRemoteModuleFailure() {
  vi.resetModules()

  checkStorageQuota.mockReset()
  prunePlaybackHistory.mockReset()
  runIntegrityCheck.mockReset()
  logError.mockReset()

  vi.doMock('../../store/exploreStore', () => ({
    useExploreStore: (
      selector: (state: {
        loadSubscriptions: () => void
        loadFavorites: () => void
        subscriptionsLoaded: boolean
        favoritesLoaded: boolean
      }) => unknown
    ) =>
      selector({
        loadSubscriptions: vi.fn(),
        loadFavorites: vi.fn(),
        subscriptionsLoaded: true,
        favoritesLoaded: true,
      }),
  }))

  vi.doMock('../../store/playerStore', () => ({
    usePlayerStore: (
      selector: (state: { restoreSession: () => void; initializationStatus: 'ready' }) => unknown
    ) =>
      selector({
        restoreSession: vi.fn(),
        initializationStatus: 'ready',
      }),
  }))

  vi.doMock('../../lib/storageQuota', () => ({
    checkStorageQuota: (options?: { mode?: 'silent' | 'user' }) => checkStorageQuota(options),
  }))

  vi.doMock('../../lib/retention', () => ({
    prunePlaybackHistory: () => prunePlaybackHistory(),
    runIntegrityCheck: () => runIntegrityCheck(),
  }))

  vi.doMock('../../lib/remoteTranscript', () => {
    throw new Error('chunk load failed')
  })

  vi.doMock('../../lib/logger', () => ({
    error: (...args: unknown[]) => logError(...args),
  }))

  const { useAppInitialization } = await import('../useAppInitialization')
  return useAppInitialization
}

describe('useAppInitialization module-load isolation', () => {
  it('keeps retention and integrity running when remoteTranscript module fails to load', async () => {
    const useAppInitialization = await loadHookWithRemoteModuleFailure()

    renderHook(() => useAppInitialization())

    await waitFor(() => {
      expect(prunePlaybackHistory).toHaveBeenCalledTimes(1)
      expect(runIntegrityCheck).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(logError).toHaveBeenCalledWith(
        '[Init] Remote transcript module failed to load',
        expect.any(Error)
      )
    })
  })
})
