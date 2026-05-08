import { DB } from '../dexieDb'

export const StorageRepository = {
  getStorageInfo(): Promise<Awaited<ReturnType<typeof DB.getStorageInfo>>> {
    return DB.getStorageInfo()
  },

  clearPlaybackSessionAudioCache(id: string): Promise<boolean> {
    return DB.clearPlaybackSessionAudioCache(id)
  },

  clearAllData(): Promise<void> {
    return DB.clearAllData()
  },

  clearAllAudioBlobs(): Promise<void> {
    return DB.clearAllAudioBlobs()
  },
}
