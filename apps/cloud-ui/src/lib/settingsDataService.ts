import type { PlaybackSession } from './dexieDb'
import { PlaybackRepository } from './repositories/PlaybackRepository'
import { StorageRepository } from './repositories/StorageRepository'

export type StorageInfo = Awaited<ReturnType<typeof StorageRepository.getStorageInfo>>

export interface SettingsDataSnapshot {
  storageInfo: StorageInfo
  sessions: PlaybackSession[]
}

export async function loadSettingsDataSnapshot(): Promise<SettingsDataSnapshot> {
  const [storageInfo, sessions] = await Promise.all([
    StorageRepository.getStorageInfo(),
    PlaybackRepository.getAllPlaybackSessions(),
  ])

  return {
    storageInfo,
    sessions,
  }
}
