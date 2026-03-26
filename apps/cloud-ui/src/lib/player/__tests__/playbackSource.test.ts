import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
// ─── Imports ─────────────────────────────────────────────────────────

import { db } from '../../dexieDb'
import { findDownloadedTrack } from '../../downloadService'
import {
  __dropPlaybackSourceObjectUrl,
  __resetPlaybackSourceCache,
  resolvePlaybackSource,
} from '../playbackSource'

vi.mock('../../dexieDb', () => ({
  db: {
    audioBlobs: {
      get: vi.fn(),
    },
    tracks: {
      update: vi.fn().mockResolvedValue(1),
    },
  },
}))

vi.mock('../../downloadService', () => ({
  findDownloadedTrack: vi.fn(),
}))

const mockNow = 1600000000000

describe('resolvePlaybackSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetPlaybackSourceCache()
    vi.spyOn(Date, 'now').mockReturnValue(mockNow)

    // Mock only URL.createObjectURL and URL.revokeObjectURL
    vi.spyOn(global.URL, 'createObjectURL').mockImplementation(
      (blob) => `blob:object_url_for_${(blob as Blob).type}`
    )
    vi.spyOn(global.URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  it('should return original url if no normalized url can be produced', async () => {
    const invalidUrl = 'invalid-url'
    const result = await resolvePlaybackSource(invalidUrl)
    expect(result).toEqual({ url: invalidUrl })
  })

  it('should return original url if track is not found', async () => {
    vi.mocked(findDownloadedTrack).mockResolvedValue(undefined)
    const result = await resolvePlaybackSource('https://example.com/audio.mp3')
    expect(result).toEqual({ url: 'https://example.com/audio.mp3' })
  })

  it('should return original url if track has no audioId', async () => {
    vi.mocked(findDownloadedTrack).mockResolvedValue({
      id: 'track_1',
      name: 'Test Setup',
      sizeBytes: 0,
      createdAt: 0,
    } as unknown as import('../../db/types').PodcastDownload)
    const result = await resolvePlaybackSource('https://example.com/audio.mp3')
    expect(result).toEqual({ url: 'https://example.com/audio.mp3' })
  })

  it('should return original url if audio blob is not found', async () => {
    vi.mocked(findDownloadedTrack).mockResolvedValue({
      id: 'track_1',
      audioId: 'blob_1',
      name: 'Test Setup',
      sizeBytes: 0,
      createdAt: 0,
    } as unknown as import('../../db/types').PodcastDownload)
    vi.mocked(db.audioBlobs.get as unknown as Mock).mockResolvedValue(undefined)

    const result = await resolvePlaybackSource('https://example.com/audio.mp3')
    expect(result).toEqual({ url: 'https://example.com/audio.mp3', trackId: 'track_1' })
  })

  it('should return blob url and objectId if everything is found', async () => {
    const trackMock = {
      id: 'track_1',
      audioId: 'blob_1',
      name: 'Test Setup',
      sizeBytes: 0,
      createdAt: 0,
    }
    vi.mocked(findDownloadedTrack).mockResolvedValue(
      trackMock as unknown as import('../../db/types').PodcastDownload
    )

    const blobMock = new Blob(['dummy audio content'], { type: 'audio/mpeg' })
    vi.mocked(db.audioBlobs.get as unknown as Mock).mockResolvedValue({
      blob: blobMock,
    })

    const result = await resolvePlaybackSource('https://example.com/audio.mp3')

    // Should update lastAccessedAt because it was missing
    expect(db.tracks.update).toHaveBeenCalledWith('track_1', { lastAccessedAt: mockNow })

    expect(result.url).toBe('blob:object_url_for_audio/mpeg')
    expect(result.trackId).toBe('track_1')
  })

  it('should throttle lastAccessedAt updates to once per 60s', async () => {
    const trackMock = {
      id: 'track_2',
      audioId: 'blob_2',
      name: 'Test Setup',
      sizeBytes: 0,
      createdAt: 0,
      lastAccessedAt: mockNow - 1000, // accessed 1 second ago
    }
    vi.mocked(findDownloadedTrack).mockResolvedValue(
      trackMock as unknown as import('../../db/types').PodcastDownload
    )

    const blobMock = new Blob([], { type: 'audio/mpeg' })
    vi.mocked(db.audioBlobs.get as unknown as Mock).mockResolvedValue({ blob: blobMock })

    await resolvePlaybackSource('https://example.com/audio.mp3')

    // Should NOT update since only 1s has passed
    expect(db.tracks.update).not.toHaveBeenCalled()
  })

  it('should update lastAccessedAt if more than 60s have passed', async () => {
    const trackMock = {
      id: 'track_3',
      audioId: 'blob_3',
      name: 'Test Setup',
      sizeBytes: 0,
      createdAt: 0,
      lastAccessedAt: mockNow - 61000, // accessed 61 seconds ago
    }
    vi.mocked(findDownloadedTrack).mockResolvedValue(
      trackMock as unknown as import('../../db/types').PodcastDownload
    )

    const blobMock = new Blob([], { type: 'audio/mpeg' })
    vi.mocked(db.audioBlobs.get as unknown as Mock).mockResolvedValue({ blob: blobMock })

    await resolvePlaybackSource('https://example.com/audio.mp3')

    // Should update since > 60s
    expect(db.tracks.update).toHaveBeenCalledWith('track_3', { lastAccessedAt: mockNow })
  })

  it('invalidates cached blob url when it has been revoked externally', async () => {
    const trackMock = {
      id: 'track_4',
      audioId: 'blob_4',
      name: 'Test Setup',
      sizeBytes: 0,
      createdAt: 0,
    }
    vi.mocked(findDownloadedTrack).mockResolvedValue(
      trackMock as unknown as import('../../db/types').PodcastDownload
    )

    const blobMock = new Blob([], { type: 'audio/mpeg' })
    vi.mocked(db.audioBlobs.get as unknown as Mock).mockResolvedValue({ blob: blobMock })

    let seq = 0
    vi.spyOn(global.URL, 'createObjectURL').mockImplementation(() => `blob:url-${++seq}`)

    const first = await resolvePlaybackSource('https://example.com/audio.mp3')
    const second = await resolvePlaybackSource('https://example.com/audio.mp3')

    expect(first.url).toBe('blob:url-1')
    expect(second.url).toBe('blob:url-1')
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1)

    __dropPlaybackSourceObjectUrl(first.url)

    const third = await resolvePlaybackSource('https://example.com/audio.mp3')
    expect(third.url).toBe('blob:url-2')
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(2)
  })
})
