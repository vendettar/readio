import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findDownloadedTrackMock, dbAudioBlobsGetMock, logErrorMock } = vi.hoisted(() => ({
  findDownloadedTrackMock: vi.fn(),
  dbAudioBlobsGetMock: vi.fn(),
  logErrorMock: vi.fn(),
}))

vi.mock('../downloadService', async (importActual) => {
  const actual = await importActual<typeof import('../downloadService')>()
  return {
    ...actual,
    findDownloadedTrack: (...args: unknown[]) => findDownloadedTrackMock(...args),
  }
})

vi.mock('../dexieDb', () => ({
  db: {
    audioBlobs: {
      get: (...args: unknown[]) => dbAudioBlobsGetMock(...args),
    },
  },
}))

vi.mock('../logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

import { resolvePlaybackSource } from '../player/playbackSource'

describe('playbackSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findDownloadedTrackMock.mockReset()
    dbAudioBlobsGetMock.mockReset()
    logErrorMock.mockReset()
  })

  it('unwraps tracking URLs when no local blob is available', async () => {
    findDownloadedTrackMock.mockResolvedValueOnce(undefined)

    const resolved = await resolvePlaybackSource(
      'https://dts.podtrac.com/redirect.mp3/prefix.up.audio/example.com/audio.mp3'
    )

    expect(resolved.url).toBe('https://prefix.up.audio/example.com/audio.mp3')
    expect(resolved.trackId).toBeUndefined()
  })

  it('falls back to the unwrapped remote URL when the cached blob is missing', async () => {
    findDownloadedTrackMock.mockResolvedValueOnce({
      id: 'track-2',
      audioId: 'missing-audio',
    })
    dbAudioBlobsGetMock.mockResolvedValueOnce(undefined)

    const resolved = await resolvePlaybackSource('https://example.com/missing.mp3')

    expect(resolved.url).toBe('https://example.com/missing.mp3')
    expect(resolved.trackId).toBe('track-2')
  })
})
