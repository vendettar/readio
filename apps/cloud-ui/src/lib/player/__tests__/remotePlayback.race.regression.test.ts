import { beforeEach, describe, expect, it, vi } from 'vitest'
import { removeDownloadedTrack } from '../../downloadService'
import {
  type CanonicalRemoteEpisodeMetadata,
  createCanonicalRemoteEpisodeMetadata,
} from '../playbackMetadata'
import { bumpPlaybackEpoch, downloadAndResolve, getPlaybackEpoch } from '../remotePlayback'

function expectCanonicalRemoteMetadata(
  metadata: ReturnType<typeof createCanonicalRemoteEpisodeMetadata>
): CanonicalRemoteEpisodeMetadata {
  expect(metadata).not.toBeNull()
  return metadata as CanonicalRemoteEpisodeMetadata
}

vi.mock('../../downloadService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../downloadService')>()
  return {
    ...actual,
    downloadEpisode: vi.fn(),
    findDownloadedTrack: vi.fn(),
    removeDownloadedTrack: vi.fn(),
  }
})

vi.mock('../playbackSource', () => ({
  resolvePlaybackSource: vi.fn(),
}))

vi.mock('../logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('../../id', () => ({
  createId: () => 'mock-id',
}))

describe('remotePlayback Race Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('P1: epoch guard - does not call removeDownloadedTrack if epoch changes during dirty detection', async () => {
    const { resolvePlaybackSource } = await import('../playbackSource')

    // Simulate dirty track: resolvePlaybackSource returns a non-blob URL but HAS a trackId
    vi.mocked(resolvePlaybackSource).mockResolvedValue({
      url: 'https://remote.com/audio.mp3',
      trackId: 'dirty-track-123',
    })

    const payload = {
      audioUrl: 'https://remote.com/audio.mp3',
      title: 'Test',
      artwork: '',
      metadata: expectCanonicalRemoteMetadata(
        createCanonicalRemoteEpisodeMetadata({
          countryAtSave: 'us',
          showTitle: 'Podcast',
          artworkUrl: 'https://example.com/art.jpg',
          episodeGuid: 'episode-guid-1',
          podcastItunesId: 'podcast-1',
        })
      ),
    }

    const currentEpoch = getPlaybackEpoch()

    // Start the process
    const promise = downloadAndResolve(currentEpoch, payload, false)

    // IMMEDIATELY bump epoch before the next async tick in downloadAndResolve
    bumpPlaybackEpoch()

    const result = await promise

    expect(result).toBeNull()
    expect(removeDownloadedTrack).not.toHaveBeenCalled()
  })
})
