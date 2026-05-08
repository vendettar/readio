import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSettingsDataSnapshot } from '../settingsDataService'
import { PlaybackRepository } from '../repositories/PlaybackRepository'
import { StorageRepository } from '../repositories/StorageRepository'

vi.mock('../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getAllPlaybackSessions: vi.fn(),
  },
}))

vi.mock('../repositories/StorageRepository', () => ({
  StorageRepository: {
    getStorageInfo: vi.fn(),
  },
}))

describe('settingsDataService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads storage info and sessions together', async () => {
    vi.mocked(StorageRepository.getStorageInfo).mockResolvedValue({
      indexedDB: {
        sessions: 2,
        audioBlobs: 3,
        audioBlobsSize: 300,
        subtitles: 1,
        subtitlesSize: 10,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 310,
      },
      browser: null,
    })
    vi.mocked(PlaybackRepository.getAllPlaybackSessions).mockResolvedValue([
      {
        id: 'session-1',
        source: 'local',
        title: 'Track 1',
        createdAt: 1,
        lastPlayedAt: 1,
        sizeBytes: 0,
        durationSeconds: 120,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        progress: 0,
        audioFilename: '',
        subtitleFilename: '',
      },
    ])

    const snapshot = await loadSettingsDataSnapshot()

    expect(snapshot).toEqual({
      storageInfo: expect.objectContaining({
        indexedDB: expect.objectContaining({
          totalSize: 310,
        }),
      }),
      sessions: [
        expect.objectContaining({
          id: 'session-1',
        }),
      ],
    })

    expect(StorageRepository.getStorageInfo).toHaveBeenCalledTimes(1)
    expect(PlaybackRepository.getAllPlaybackSessions).toHaveBeenCalledTimes(1)
  })
})
