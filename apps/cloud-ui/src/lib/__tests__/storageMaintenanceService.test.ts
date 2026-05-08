import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCredentials } from '../db/credentialsRepository'
import { PlaybackRepository } from '../repositories/PlaybackRepository'
import { StorageRepository } from '../repositories/StorageRepository'
import { SETTINGS_STORAGE_KEY } from '../schemas/settings'
import { clearDictCacheMemory } from '../selection/dictCache'
import {
  clearPlaybackSessionAudioCacheForMaintenance,
  deletePlaybackSessionForMaintenance,
  wipeAllPersistentStorage,
  wipeStoredAudioCache,
} from '../storageMaintenanceService'

vi.mock('../db/credentialsRepository', () => ({
  clearAllCredentials: vi.fn(async () => {}),
}))

vi.mock('../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    deletePlaybackSession: vi.fn(async () => {}),
  },
}))

vi.mock('../repositories/StorageRepository', () => ({
  StorageRepository: {
    clearPlaybackSessionAudioCache: vi.fn(async () => false),
    clearAllData: vi.fn(async () => {}),
    clearAllAudioBlobs: vi.fn(async () => {}),
  },
}))

vi.mock('../selection/dictCache', () => ({
  clearDictCacheMemory: vi.fn(async () => {}),
}))

describe('storageMaintenanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('delegates session deletion to DB', async () => {
    await deletePlaybackSessionForMaintenance('session-1')

    expect(PlaybackRepository.deletePlaybackSession).toHaveBeenCalledWith('session-1')
  })

  it('delegates session audio-cache clearing to DB', async () => {
    vi.mocked(StorageRepository.clearPlaybackSessionAudioCache).mockResolvedValueOnce(true)

    const didClear = await clearPlaybackSessionAudioCacheForMaintenance('session-2')

    expect(StorageRepository.clearPlaybackSessionAudioCache).toHaveBeenCalledWith('session-2')
    expect(didClear).toBe(true)
  })

  it('wipes persistent storage and obsolete local storage keys', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    localStorage.setItem('readio-user-credentials', 'legacy')

    await wipeAllPersistentStorage()

    expect(clearAllCredentials).toHaveBeenCalledTimes(1)
    expect(StorageRepository.clearAllData).toHaveBeenCalledTimes(1)
    expect(clearDictCacheMemory).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem('readio-user-credentials')).toBeNull()
  })

  it('wipes stored audio cache through DB', async () => {
    await wipeStoredAudioCache()

    expect(StorageRepository.clearAllAudioBlobs).toHaveBeenCalledTimes(1)
  })
})
