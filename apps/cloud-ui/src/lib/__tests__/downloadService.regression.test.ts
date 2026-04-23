import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSession, Track } from '../db/types'
import { DB } from '../dexieDb'

const {
  checkDownloadCapacityMock,
  loadRemoteTranscriptWithCacheMock,
  upsertBuiltInSubtitleVersionMock,
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
  loadRemoteTranscriptWithCacheMock: vi.fn(),
  upsertBuiltInSubtitleVersionMock: vi.fn(),
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

vi.mock('../remoteTranscript', () => ({
  getValidTranscriptUrl: (url?: string | null) => {
    const normalized = url?.trim()
    return normalized ? normalized : null
  },
  loadRemoteTranscriptWithCache: (...args: unknown[]) => loadRemoteTranscriptWithCacheMock(...args),
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
    upsertBuiltInSubtitleVersion: (...args: unknown[]) => upsertBuiltInSubtitleVersionMock(...args),
  },
}))

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    iterateAllTracks: async (cb: (track: Track) => void | Promise<void>) => {
      const tracks = (await toArrayDownloadsMock()) as Track[]
      for (const track of tracks) {
        await cb(track)
      }
    },
  },
}))

vi.mock('../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    iterateAllPlaybackSessions: async (cb: (session: PlaybackSession) => void | Promise<void>) => {
      const sessions = (await toArraySessionsMock()) as PlaybackSession[]
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
    loadRemoteTranscriptWithCacheMock.mockResolvedValue({
      ok: true,
      cues: [{ start: 0, end: 1000, text: 'hello' }],
    })
    upsertBuiltInSubtitleVersionMock.mockResolvedValue(true)
    checkDownloadCapacityMock.mockResolvedValue({
      allowed: true,
      currentUsageBytes: 0,
      capBytes: 1024,
    })
    vi.mocked(DB.addPodcastDownload).mockResolvedValue('track-built-in')
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

  it('persists a built-in transcript version after saving a download with transcriptUrl', async () => {
    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      showTitle: 'Podcast',
      countryAtSave: 'us',
      transcriptUrl: 'https://example.com/transcript.vtt',
    })

    expect(result).toEqual({
      ok: true,
      trackId: 'track-built-in',
    })
    expect(DB.addPodcastDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptUrl: 'https://example.com/transcript.vtt',
      })
    )
    expect(loadRemoteTranscriptWithCacheMock).toHaveBeenCalledWith(
      'https://example.com/transcript.vtt'
    )
    expect(upsertBuiltInSubtitleVersionMock).toHaveBeenCalledWith({
      trackId: 'track-built-in',
      cues: [{ start: 0, end: 1000, text: 'hello' }],
      subtitleName: 'Episode transcript',
      subtitleFilename: 'Episode.transcript.vtt',
      transcriptUrl: 'https://example.com/transcript.vtt',
      setActive: true,
    })
  })

  it('persists episodeGuid as the only stable episode identity', async () => {
    await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      showTitle: 'Podcast',
      countryAtSave: 'us',
      episodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
    })

    expect(DB.addPodcastDownload).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEpisodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
      })
    )
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
