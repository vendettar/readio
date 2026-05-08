import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPlaybackSessionAudioCacheForMaintenance,
  deletePlaybackSessionForMaintenance,
  wipeAllPersistentStorage,
  wipeStoredAudioCache,
} from '../../lib/storageMaintenanceService'
import { useStorageMaintenance } from '../useStorageMaintenance'

const { toastSuccessKeyMock, toastErrorKeyMock } = vi.hoisted(() => ({
  toastSuccessKeyMock: vi.fn(),
  toastErrorKeyMock: vi.fn(),
}))

vi.mock('../../lib/storageMaintenanceService', () => ({
  deletePlaybackSessionForMaintenance: vi.fn(async () => {}),
  clearPlaybackSessionAudioCacheForMaintenance: vi.fn(async () => false),
  wipeAllPersistentStorage: vi.fn(async () => {}),
  wipeStoredAudioCache: vi.fn(async () => {}),
}))

vi.mock('../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    successKey: toastSuccessKeyMock,
    errorKey: toastErrorKeyMock,
  },
}))

describe('useStorageMaintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wipeAll delegates to service and reloads on success', async () => {
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.wipeAll()
    })

    expect(wipeAllPersistentStorage).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(toastSuccessKeyMock).toHaveBeenCalledWith('toastAllDataCleared')
  })

  it('wipeAudioCache clears only audio cache and preserves credentials', async () => {
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.wipeAudioCache()
    })

    expect(wipeStoredAudioCache).toHaveBeenCalledTimes(1)
    expect(wipeAllPersistentStorage).not.toHaveBeenCalled()
  })

  it('clearSessionCache delegates to safe DB API and reloads only when cleared', async () => {
    vi.mocked(clearPlaybackSessionAudioCacheForMaintenance).mockResolvedValueOnce(true)
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.clearSessionCache('session-1')
    })

    expect(clearPlaybackSessionAudioCacheForMaintenance).toHaveBeenCalledWith('session-1')
    expect(toastSuccessKeyMock).toHaveBeenCalledWith('toastAudioRemoved')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clearSessionCache remains no-op when no cache exists', async () => {
    vi.mocked(clearPlaybackSessionAudioCacheForMaintenance).mockResolvedValueOnce(false)
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.clearSessionCache('session-2')
    })

    expect(clearPlaybackSessionAudioCacheForMaintenance).toHaveBeenCalledWith('session-2')
    expect(toastSuccessKeyMock).not.toHaveBeenCalledWith('toastAudioRemoved')
    expect(reload).not.toHaveBeenCalled()
  })

  it('clearSessionCache reports error when DB API throws', async () => {
    vi.mocked(clearPlaybackSessionAudioCacheForMaintenance).mockRejectedValueOnce(
      new Error('clear failed')
    )
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.clearSessionCache('session-3')
    })

    expect(toastErrorKeyMock).toHaveBeenCalledWith('toastRemoveDownloadedAudioFailed')
    expect(reload).not.toHaveBeenCalled()
  })

  it('deleteSession delegates to service and reloads on success', async () => {
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.deleteSession('session-delete')
    })

    expect(deletePlaybackSessionForMaintenance).toHaveBeenCalledWith('session-delete')
    expect(toastSuccessKeyMock).toHaveBeenCalledWith('toastDeleted')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
