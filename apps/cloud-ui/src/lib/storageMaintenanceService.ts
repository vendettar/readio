import { clearAllCredentials } from './db/credentialsRepository'
import { PlaybackRepository } from './repositories/PlaybackRepository'
import { StorageRepository } from './repositories/StorageRepository'
import { bumpSettingsWriteEpoch, SETTINGS_STORAGE_KEY } from './schemas/settings'
import { clearDictCacheMemory } from './selection/dictCache'

export async function deletePlaybackSessionForMaintenance(id: string): Promise<void> {
  await PlaybackRepository.deletePlaybackSession(id)
}

export async function clearPlaybackSessionAudioCacheForMaintenance(id: string): Promise<boolean> {
  return StorageRepository.clearPlaybackSessionAudioCache(id)
}

export async function wipeAllPersistentStorage(): Promise<void> {
  bumpSettingsWriteEpoch()
  await clearAllCredentials()
  await StorageRepository.clearAllData()
  await clearDictCacheMemory()
  localStorage.removeItem(SETTINGS_STORAGE_KEY)
  localStorage.removeItem('readio-user-credentials')
}

export async function wipeStoredAudioCache(): Promise<void> {
  await StorageRepository.clearAllAudioBlobs()
}
