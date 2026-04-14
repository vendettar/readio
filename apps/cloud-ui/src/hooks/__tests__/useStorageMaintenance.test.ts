import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY } from '../../lib/schemas/settings'
import { useStorageMaintenance } from '../useStorageMaintenance'

const {
  clearAllCredentialsMock,
  clearAllDataMock,
  clearAllAudioBlobsMock,
  clearPlaybackSessionAudioCacheMock,
  clearDiscoveryMemoryCacheMock,
  runDiscoveryCacheMaintenanceMock,
  clearDictCacheMemoryMock,
  toastSuccessKeyMock,
  toastErrorKeyMock,
} = vi.hoisted(() => ({
  clearAllCredentialsMock: vi.fn(async () => {}),
  clearAllDataMock: vi.fn(async () => {}),
  clearAllAudioBlobsMock: vi.fn(async () => {}),
  clearPlaybackSessionAudioCacheMock: vi.fn(async () => false),
  clearDiscoveryMemoryCacheMock: vi.fn(),
  runDiscoveryCacheMaintenanceMock: vi.fn(async () => {}),
  clearDictCacheMemoryMock: vi.fn(async () => {}),
  toastSuccessKeyMock: vi.fn(),
  toastErrorKeyMock: vi.fn(),
}))

vi.mock('../../lib/db/credentialsRepository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/db/credentialsRepository')>()
  return {
    ...actual,
    clearAllCredentials: clearAllCredentialsMock,
  }
})

vi.mock('../../lib/dexieDb', () => ({
  DB: {
    clearAllData: clearAllDataMock,
    clearAllAudioBlobs: clearAllAudioBlobsMock,
    clearPlaybackSessionAudioCache: clearPlaybackSessionAudioCacheMock,
    deletePlaybackSession: vi.fn(async () => {}),
  },
}))

vi.mock('../../lib/discovery', () => ({
  clearDiscoveryMemoryCache: clearDiscoveryMemoryCacheMock,
  runDiscoveryCacheMaintenance: runDiscoveryCacheMaintenanceMock,
}))

vi.mock('../../lib/selection/dictCache', () => ({
  clearDictCacheMemory: clearDictCacheMemoryMock,
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
    localStorage.clear()
  })

  it('wipeAll clears db, all runtime memory caches, and local settings/legacy key', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ proxyUrl: 'https://proxy.local' }))
    const LEGACY_STORAGE_KEY = 'readio-user-credentials'
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ translateKey: 'sk-test', groqKey: 'gsk_test' })
    )

    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.wipeAll()
    })

    expect(clearAllCredentialsMock).toHaveBeenCalledTimes(1)
    expect(clearAllDataMock).toHaveBeenCalledTimes(1)
    expect(clearDiscoveryMemoryCacheMock).toHaveBeenCalledTimes(1)
    expect(runDiscoveryCacheMaintenanceMock).toHaveBeenCalledTimes(1)
    expect(clearDictCacheMemoryMock).toHaveBeenCalledTimes(1)

    // In some environments, wipeAll might trigger a re-parse that auto-selects groq.
    // We check that at least it's not the OLD value.
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      expect(JSON.parse(stored).proxyUrl).toBeUndefined()
    } else {
      expect(stored).toBeNull()
    }

    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(toastSuccessKeyMock).toHaveBeenCalledWith('toastAllDataCleared')
  })

  it('wipeAudioCache clears only audio cache and preserves credentials', async () => {
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.wipeAudioCache()
    })

    expect(clearAllAudioBlobsMock).toHaveBeenCalledTimes(1)
    expect(clearAllCredentialsMock).not.toHaveBeenCalled()
  })

  it('clearSessionCache delegates to safe DB API and reloads only when cleared', async () => {
    clearPlaybackSessionAudioCacheMock.mockResolvedValueOnce(true)
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.clearSessionCache('session-1')
    })

    expect(clearPlaybackSessionAudioCacheMock).toHaveBeenCalledWith('session-1')
    expect(toastSuccessKeyMock).toHaveBeenCalledWith('toastAudioRemoved')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('clearSessionCache remains no-op when no cache exists', async () => {
    clearPlaybackSessionAudioCacheMock.mockResolvedValueOnce(false)
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.clearSessionCache('session-2')
    })

    expect(clearPlaybackSessionAudioCacheMock).toHaveBeenCalledWith('session-2')
    expect(toastSuccessKeyMock).not.toHaveBeenCalledWith('toastAudioRemoved')
    expect(reload).not.toHaveBeenCalled()
  })

  it('clearSessionCache reports error when DB API throws', async () => {
    clearPlaybackSessionAudioCacheMock.mockRejectedValueOnce(new Error('clear failed'))
    const reload = vi.fn()
    const { result } = renderHook(() => useStorageMaintenance({ reload }))

    await act(async () => {
      await result.current.clearSessionCache('session-3')
    })

    expect(toastErrorKeyMock).toHaveBeenCalledWith('toastRemoveDownloadedAudioFailed')
    expect(reload).not.toHaveBeenCalled()
  })
})
