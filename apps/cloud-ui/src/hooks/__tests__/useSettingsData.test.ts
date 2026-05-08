import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsData } from '../useSettingsData'
import { loadSettingsDataSnapshot } from '../../lib/settingsDataService'

vi.mock('../../lib/settingsDataService', () => ({
  loadSettingsDataSnapshot: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

describe('useSettingsData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads sessions and storage info through the settings data service', async () => {
    vi.mocked(loadSettingsDataSnapshot).mockResolvedValue({
      storageInfo: {
        indexedDB: {
          sessions: 1,
          audioBlobs: 2,
          audioBlobsSize: 200,
          subtitles: 1,
          subtitlesSize: 10,
          remoteTranscripts: 0,
          remoteTranscriptsSize: 0,
          totalSize: 210,
        },
        browser: null,
      },
      sessions: [
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
      ],
    })

    const { result } = renderHook(() => useSettingsData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(loadSettingsDataSnapshot).toHaveBeenCalledTimes(1)
    expect(result.current.storageInfo?.indexedDB.totalSize).toBe(210)
    expect(result.current.sessions).toHaveLength(1)
  })
})
