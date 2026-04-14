import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import type { FileSubtitle, SubtitleText } from '../db/types'
import { db } from '../dexieDb'
import { tryApplyCachedAsrTranscript } from '../remoteTranscript'
import { DownloadsRepository } from '../repositories/DownloadsRepository'

vi.mock('../repositories/DownloadsRepository', () => ({
  DownloadsRepository: {
    getReadySubtitlesByTrackId: vi.fn(),
  },
}))

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    getTrackById: vi.fn(),
    getReadySubtitlesByTrackId: vi.fn(),
  },
}))

vi.mock('../dexieDb', () => ({
  db: {
    tracks: {
      get: vi.fn(),
    },
  },
  DB: {},
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: {
    getState: vi.fn().mockReturnValue({
      loadRequestId: 1,
      audioUrl: 'https://example.com/audio.mp3',
    }),
  },
}))

vi.mock('../../store/transcriptStore', () => ({
  useTranscriptStore: {
    getState: vi.fn().mockReturnValue({
      setSubtitles: vi.fn(),
    }),
  },
}))

describe('remoteTranscript integration (tryApplyCachedAsrTranscript)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usePlayerStore.getState).mockReturnValue({
      loadRequestId: 1,
      audioUrl: 'https://example.com/audio.mp3',
    } as unknown as ReturnType<typeof usePlayerStore.getState>)
    vi.mocked(useTranscriptStore.getState).mockReturnValue({
      setSubtitles: vi.fn(),
    } as unknown as ReturnType<typeof useTranscriptStore.getState>)
  })

  it('falls back to secondary subtitle if active one is empty/malformed', async () => {
    vi.mocked(db.tracks.get).mockResolvedValue(undefined) // Not a local file track

    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([
      {
        fileSub: { id: 'sub-1' } as unknown as FileSubtitle,
        subtitle: { cues: [] } as unknown as SubtitleText, // Corrupted/Empty
      },
      {
        fileSub: { id: 'sub-2' } as unknown as FileSubtitle,
        subtitle: {
          cues: [{ start: 0, end: 1, text: 'Valid' }],
        } as unknown as SubtitleText,
      },
    ])

    const success = await tryApplyCachedAsrTranscript('https://example.com/audio.mp3', 'track-1', 1)

    expect(success).toBe(true)
    expect(useTranscriptStore.getState().setSubtitles).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ text: 'Valid' })])
    )
  })

  it('returns false if all candidates are invalid', async () => {
    vi.mocked(db.tracks.get).mockResolvedValue(undefined)
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([
      {
        fileSub: { id: 'sub-1' } as unknown as FileSubtitle,
        subtitle: { cues: [] } as unknown as SubtitleText,
      },
    ])

    const success = await tryApplyCachedAsrTranscript('https://example.com/audio.mp3', 'track-1', 1)
    expect(success).toBe(false)
  })
})
