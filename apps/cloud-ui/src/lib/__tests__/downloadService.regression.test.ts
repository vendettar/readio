import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackSession, Track } from '../db/types'
import { createCanonicalRemoteEpisodeMetadata } from '../player/playbackMetadata'

const {
  checkDownloadCapacityMock,
  loadRemoteTranscriptWithCacheMock,
  upsertBuiltInSubtitleVersionMock,
  toastErrorKeyMock,
  toastInfoKeyMock,
  trackByUrlFirstMock,
  trackByCanonicalFirstMock,
  toArrayBlobsMock,
  toArrayTracksMock,
  toArrayDownloadsMock,
  toArraySessionsMock,
  bulkDeleteMock,
  persistDownloadedEpisodeMock,
} = vi.hoisted(() => ({
  checkDownloadCapacityMock: vi.fn(),
  loadRemoteTranscriptWithCacheMock: vi.fn(),
  upsertBuiltInSubtitleVersionMock: vi.fn(),
  toastErrorKeyMock: vi.fn(),
  toastInfoKeyMock: vi.fn(),
  trackByUrlFirstMock: vi.fn(),
  trackByCanonicalFirstMock: vi.fn(),
  toArrayBlobsMock: vi.fn(),
  toArrayTracksMock: vi.fn(),
  toArrayDownloadsMock: vi.fn(),
  toArraySessionsMock: vi.fn(),
  bulkDeleteMock: vi.fn(),
  persistDownloadedEpisodeMock: vi.fn(),
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
  db: {
    tracks: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          first: (...args: unknown[]) => trackByUrlFirstMock(...args),
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
  },
}))

vi.mock('../repositories/DownloadsRepository', () => ({
  DownloadsRepository: {
    findTrackByUrl: (...args: unknown[]) => trackByUrlFirstMock(...args),
    findTrackByPodcastAndEpisode: (...args: unknown[]) => trackByCanonicalFirstMock(...args),
    persistDownloadedEpisode: (...args: unknown[]) => persistDownloadedEpisodeMock(...args),
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

import {
  buildDownloadJobOptionsFromCanonicalRemoteMetadata,
  buildDownloadJobOptionsFromEpisodeProps,
  downloadEpisode,
  findDownloadedTrackForEpisode,
  getStoredDownloadStatusForEpisode,
  persistAudioBlobAsDownload,
  sweepOrphanedBlobs,
} from '../downloadService'

describe('downloadService regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    trackByUrlFirstMock.mockResolvedValue(undefined)
    trackByCanonicalFirstMock.mockResolvedValue(undefined)
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
    toArrayBlobsMock.mockResolvedValue([])
    toArrayTracksMock.mockResolvedValue([])
    toArrayDownloadsMock.mockResolvedValue([])
    toArraySessionsMock.mockResolvedValue([])
    bulkDeleteMock.mockResolvedValue(undefined)
    persistDownloadedEpisodeMock.mockResolvedValue('track-built-in')
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
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    })

    expect(result).toEqual({
      ok: false,
      reason: 'capacity_blocked',
    })
    expect(toastErrorKeyMock).toHaveBeenCalledWith('downloadStorageLimitApp')
    expect(persistDownloadedEpisodeMock).not.toHaveBeenCalled()
  })

  it('does not emit downloadAlreadyExists toast when silent download callers hit an existing track', async () => {
    trackByCanonicalFirstMock.mockResolvedValue({
      id: 'existing-track-1',
    })

    const result = await downloadEpisode({
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      silent: true,
    })

    expect(result).toEqual({
      ok: true,
      trackId: 'existing-track-1',
      reason: 'already_downloaded',
    })
    expect(toastInfoKeyMock).not.toHaveBeenCalledWith('downloadAlreadyExists')
  })

  it('deduplicates by canonical episode identity before URL when the source URL rotates', async () => {
    trackByCanonicalFirstMock.mockResolvedValue({
      id: 'existing-track-rotated',
      sourceUrlNormalized: 'https://old-cdn.example.com/audio.mp3',
    })

    const result = await downloadEpisode({
      audioUrl: 'https://new-cdn.example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      silent: true,
    })

    expect(result).toEqual({
      ok: true,
      trackId: 'existing-track-rotated',
      reason: 'already_downloaded',
    })
    expect(trackByCanonicalFirstMock).toHaveBeenCalledWith('pod-1', 'episode-guid-1')
    expect(trackByUrlFirstMock).not.toHaveBeenCalled()
  })

  it('supports URL-only lookup paths without partial canonical fields', async () => {
    trackByUrlFirstMock.mockResolvedValue({
      id: 'existing-track-url-only',
    })

    const track = await findDownloadedTrackForEpisode({
      audioUrl: 'https://example.com/audio.mp3',
    })

    expect(track).toEqual({
      id: 'existing-track-url-only',
    })
    expect(trackByCanonicalFirstMock).not.toHaveBeenCalled()
    expect(trackByUrlFirstMock).toHaveBeenCalledWith('https://example.com/audio.mp3')
    expect(
      getStoredDownloadStatusForEpisode({
        audioUrl: 'https://example.com/audio.mp3',
      })
    ).toBe('idle')
  })

  it('fails closed when downloadEpisode receives whitespace-only canonical required fields', async () => {
    const result = await downloadEpisode({
      audioUrl: ' https://example.com/audio.mp3 ',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: '   ',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    } as unknown as import('../downloadService').DownloadJobOptions)

    expect(result).toEqual({
      ok: false,
      reason: 'network_error',
    })
    expect(trackByCanonicalFirstMock).not.toHaveBeenCalled()
    expect(trackByUrlFirstMock).not.toHaveBeenCalled()
  })

  it('normalizes canonical remote episode download options once and fails closed on invalid country', () => {
    expect(
      buildDownloadJobOptionsFromEpisodeProps({
        audioUrl: ' https://example.com/audio.mp3 ',
        episodeTitle: ' Episode ',
        episodeDescription: '',
        showTitle: ' Podcast ',
        artworkUrl: ' https://example.com/art.jpg ',
        countryAtSave: 'US',
        podcastItunesId: ' pod-1 ',
        episodeGuid: ' guid-1 ',
      })
    ).toEqual(
      expect.objectContaining({
        audioUrl: 'https://example.com/audio.mp3',
        episodeTitle: 'Episode',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        countryAtSave: 'us',
        podcastItunesId: 'pod-1',
        episodeGuid: 'guid-1',
      })
    )

    expect(
      buildDownloadJobOptionsFromEpisodeProps({
        audioUrl: 'https://example.com/audio.mp3',
        episodeTitle: 'Episode',
        episodeDescription: '',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        countryAtSave: 'zz',
        podcastItunesId: 'pod-1',
        episodeGuid: 'guid-1',
      })
    ).toBeNull()
  })

  it('normalizes remote metadata download options from canonical metadata and fails closed on invalid country', () => {
    expect(
      buildDownloadJobOptionsFromCanonicalRemoteMetadata({
        audioUrl: ' https://example.com/audio.mp3 ',
        episodeTitle: ' Episode ',
        metadata: createCanonicalRemoteEpisodeMetadata({
          showTitle: ' Podcast ',
          artworkUrl: ' https://example.com/art.jpg ',
          episodeGuid: ' guid-2 ',
          podcastItunesId: ' pod-2 ',
          countryAtSave: 'us',
          description: ' Description ',
          durationSeconds: 120,
          transcriptUrl: ' https://example.com/transcript.vtt ',
        })!,
      })
    ).toEqual(
      expect.objectContaining({
        audioUrl: 'https://example.com/audio.mp3',
        episodeTitle: 'Episode',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        countryAtSave: 'us',
        podcastItunesId: 'pod-2',
        episodeGuid: 'guid-2',
        transcriptUrl: 'https://example.com/transcript.vtt',
      })
    )
  })

  it('persists a built-in transcript version after saving a download with transcriptUrl', async () => {
    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      transcriptUrl: 'https://example.com/transcript.vtt',
    })

    expect(result).toEqual({
      ok: true,
      trackId: 'track-built-in',
    })
    expect(persistDownloadedEpisodeMock).toHaveBeenCalledWith(
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
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
    })

    expect(persistDownloadedEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceEpisodeGuid: '766f112e-abcd-1234-5678-07e05e548074',
      })
    )
  })

  it('does not create a second download row when blob persistence sees a rotated URL for the same canonical episode', async () => {
    trackByCanonicalFirstMock.mockResolvedValue({
      id: 'existing-track-blob',
      sourceUrlNormalized: 'https://old-cdn.example.com/audio.mp3',
    })

    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://new-cdn.example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    })

    expect(result).toEqual({
      ok: true,
      trackId: 'existing-track-blob',
      reason: 'already_downloaded',
    })
    expect(persistDownloadedEpisodeMock).not.toHaveBeenCalled()
  })

  it('rejects blob persistence when countryAtSave is missing', async () => {
    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    } as unknown as import('../downloadService').DownloadJobOptions)

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_country',
    })
    expect(persistDownloadedEpisodeMock).not.toHaveBeenCalled()
  })

  it('rejects blob persistence when countryAtSave is invalid', async () => {
    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'zz',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    } as unknown as import('../downloadService').DownloadJobOptions)

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_country',
    })
    expect(persistDownloadedEpisodeMock).not.toHaveBeenCalled()
  })

  it('rejects blob persistence when canonical remote metadata is missing', async () => {
    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: '',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    } as unknown as import('../downloadService').DownloadJobOptions)

    expect(result).toEqual({
      ok: false,
      reason: 'network_error',
    })
    expect(persistDownloadedEpisodeMock).not.toHaveBeenCalled()
  })

  it('rejects blob persistence when artworkUrl is empty after normalization', async () => {
    const result = await persistAudioBlobAsDownload(new Blob(['audio']), {
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode',
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: '   ',
      countryAtSave: 'us',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    } as unknown as import('../downloadService').DownloadJobOptions)

    expect(result).toEqual({
      ok: false,
      reason: 'network_error',
    })
    expect(persistDownloadedEpisodeMock).not.toHaveBeenCalled()
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
