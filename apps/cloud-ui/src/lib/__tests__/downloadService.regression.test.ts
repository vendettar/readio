import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../dexieDb'

const {
  checkDownloadCapacityMock,
  toastErrorKeyMock,
  toastInfoKeyMock,
  podcastFirstMock,
  toArrayBlobsMock,
  toArrayTracksMock,
  toArrayDownloadsMock,
  toArraySessionsMock,
  bulkDeleteMock,
  transactionMock,
} = vi.hoisted(() => ({
  checkDownloadCapacityMock: vi.fn(),
  toastErrorKeyMock: vi.fn(),
  toastInfoKeyMock: vi.fn(),
  podcastFirstMock: vi.fn(),
  toArrayBlobsMock: vi.fn(),
  toArrayTracksMock: vi.fn(),
  toArrayDownloadsMock: vi.fn(),
  toArraySessionsMock: vi.fn(),
  bulkDeleteMock: vi.fn(),
  transactionMock: vi.fn(),
}))

vi.mock('../downloadCapacity', () => ({
  checkDownloadCapacity: (...args: unknown[]) => checkDownloadCapacityMock(...args),
}))

vi.mock('../toast', () => ({
  toast: {
    errorKey: (...args: unknown[]) => toastErrorKeyMock(...args),
    infoKey: (...args: unknown[]) => toastInfoKeyMock(...args),
    successKey: vi.fn(),
    warningKey: vi.fn(),
  },
}))

vi.mock('../logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('../networking/urlUtils', () => ({
  normalizePodcastAudioUrl: (url: string) => url,
  unwrapPodcastTrackingUrl: (url: string) => url,
}))

vi.mock('../dexieDb', () => ({
  DB_TABLE_NAMES: {
    AUDIO_BLOBS: 'audioBlobs',
    TRACKS: 'tracks',
  },
  db: {
    tracks: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: (...args: unknown[]) => podcastFirstMock(...args),
        })),
      })),
      toArray: (...args: unknown[]) => toArrayDownloadsMock(...args),
    },
    audioBlobs: {
      toCollection: vi.fn(() => ({
        primaryKeys: (...args: unknown[]) => toArrayBlobsMock(...args),
      })),
      bulkDelete: (...args: unknown[]) => bulkDeleteMock(...args),
    },

    playback_sessions: {
      toArray: (...args: unknown[]) => toArraySessionsMock(...args),
    },
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
  DB: {
    addPodcastDownload: vi.fn(),
    transaction: (...args: unknown[]) => transactionMock(...args),
    addAudioBlob: vi.fn().mockResolvedValue('new-audio-id'),
  },
}))

vi.mock('../repositories/DownloadsRepository', () => ({
  DownloadsRepository: {
    findTrackByUrl: (...args: unknown[]) => podcastFirstMock(...args),
    getAllTracks: (...args: unknown[]) => toArrayDownloadsMock(...args),
    removeTrack: vi.fn().mockResolvedValue(true),
  },
}))

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    iterateAllTracks: async (cb: any) => {
      const tracks = await toArrayDownloadsMock()
      for (const track of tracks) {
        await cb(track)
      }
    },
  },
}))

vi.mock('../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    iterateAllPlaybackSessions: async (cb: any) => {
      const sessions = await toArraySessionsMock()
      for (const session of sessions) {
        await cb(session)
      }
    },
    getAllAudioBlobIds: (...args: unknown[]) => toArrayBlobsMock(...args),
    deleteAudioBlobsBulk: (...args: unknown[]) => bulkDeleteMock(...args),
  },
}))

import { downloadEpisode, persistAudioBlobAsDownload, sweepOrphanedBlobs } from '../downloadService'

describe('downloadService regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    podcastFirstMock.mockResolvedValue(undefined)
    checkDownloadCapacityMock.mockResolvedValue({
      allowed: true,
      currentUsageBytes: 0,
      capBytes: 1024,
    })
    toArrayBlobsMock.mockResolvedValue([])
    toArrayTracksMock.mockResolvedValue([])
    toArrayDownloadsMock.mockResolvedValue([])
    toArraySessionsMock.mockResolvedValue([])
    bulkDeleteMock.mockResolvedValue(undefined)
    transactionMock.mockImplementation((_mode, _tables, cb) => cb())
  })

  it('blocks blob persistence when capacity pre-check fails', async () => {
    checkDownloadCapacityMock.mockResolvedValue({
      allowed: false,
      reason: 'known_size_exceeds',
      currentUsageBytes: 2048,
      capBytes: 1024,
    })

    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      countryAtSave: 'us',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'capacity_blocked',
    })
    expect(toastErrorKeyMock).toHaveBeenCalledWith('downloadStorageLimitApp')
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('does not emit downloadAlreadyExists toast when silent download callers hit an existing track', async () => {
    podcastFirstMock.mockResolvedValue({
      id: 'existing-track-1',
    })

    const result = await downloadEpisode({
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      countryAtSave: 'us',
      silent: true,
    })

    expect(result).toEqual({
      ok: true,
      trackId: 'existing-track-1',
      reason: 'already_downloaded',
    })
    expect(toastInfoKeyMock).not.toHaveBeenCalledWith('downloadAlreadyExists')
  })

  it('rejects blob persistence when countryAtSave is missing', async () => {
    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
    } as unknown as import('../downloadService').DownloadJobOptions)

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_country',
    })
    expect(DB.addAudioBlob).not.toHaveBeenCalled()
    expect(DB.addPodcastDownload).not.toHaveBeenCalled()
  })

  it('does not sweep blobs referenced by tracks', async () => {
    toArrayBlobsMock.mockResolvedValue(['blob-audio', 'blob-artwork', 'blob-orphan'])
    toArrayDownloadsMock.mockResolvedValue([{ audioId: 'blob-audio', artworkId: 'blob-artwork' }])

    const deletedCount = await sweepOrphanedBlobs()

    expect(deletedCount).toBe(1)
    expect(bulkDeleteMock).toHaveBeenCalledWith(['blob-orphan'])
  })

  it('performs chunked deletion for large number of orphans', async () => {
    // 105 orphans should trigger 3 batches (50 + 50 + 5)
    const manyOrphans = Array.from({ length: 105 }, (_, i) => `orphan-${i}`)
    toArrayBlobsMock.mockResolvedValue(manyOrphans)
    toArrayDownloadsMock.mockResolvedValue([]) // No references

    const deletedCount = await sweepOrphanedBlobs()

    expect(deletedCount).toBe(105)
    expect(bulkDeleteMock).toHaveBeenCalledTimes(3)
    expect(bulkDeleteMock).toHaveBeenNthCalledWith(1, manyOrphans.slice(0, 50))
    expect(bulkDeleteMock).toHaveBeenNthCalledWith(2, manyOrphans.slice(50, 100))
    expect(bulkDeleteMock).toHaveBeenNthCalledWith(3, manyOrphans.slice(100, 105))
  })
})
