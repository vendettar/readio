import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import type { FileSubtitle, SubtitleText } from '../db/types'
import { hasStoredTranscriptSource, tryApplyCachedAsrTranscript } from '../remoteTranscript'
import { DownloadsRepository } from '../repositories/DownloadsRepository'
import { PlaybackRepository } from '../repositories/PlaybackRepository'

vi.mock('../repositories/DownloadsRepository', () => ({
  DownloadsRepository: {
    getReadySubtitlesByTrackId: vi.fn(),
    getTrackSnapshot: vi.fn(),
  },
}))

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    getTrackById: vi.fn(),
    getReadySubtitlesByTrackId: vi.fn(),
  },
}))

vi.mock('../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getRemoteTranscriptByUrl: vi.fn(),
  },
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
    vi.mocked(DownloadsRepository.getTrackSnapshot).mockResolvedValue({
      id: 'track-1',
      sourceType: 'podcast_download',
    } as never)

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
    vi.mocked(DownloadsRepository.getTrackSnapshot).mockResolvedValue({
      id: 'track-1',
      sourceType: 'podcast_download',
    } as never)
    vi.mocked(DownloadsRepository.getReadySubtitlesByTrackId).mockResolvedValue([
      {
        fileSub: { id: 'sub-1' } as unknown as FileSubtitle,
        subtitle: { cues: [] } as unknown as SubtitleText,
      },
    ])

    const success = await tryApplyCachedAsrTranscript('https://example.com/audio.mp3', 'track-1', 1)
    expect(success).toBe(false)
  })

  it('falls back to cached remote transcript when localTrackId is stale', async () => {
    vi.mocked(DownloadsRepository.getTrackSnapshot).mockResolvedValue(undefined as never)
    vi.mocked(PlaybackRepository.getRemoteTranscriptByUrl).mockResolvedValue({
      id: 'remote-1',
      url: 'https://example.com/audio.mp3',
      cues: [{ start: 0, end: 1, text: 'Remote cue' }],
      cueSchemaVersion: 1,
      fetchedAt: Date.now(),
    })

    const success = await tryApplyCachedAsrTranscript('https://example.com/audio.mp3', 'track-1', 1)

    expect(success).toBe(true)
    expect(useTranscriptStore.getState().setSubtitles).toHaveBeenCalledWith([
      { start: 0, end: 1, text: 'Remote cue' },
    ])
  })

  it('treats cached remote transcript as a stored source when localTrackId is stale', async () => {
    vi.mocked(DownloadsRepository.getTrackSnapshot).mockResolvedValue(undefined as never)
    vi.mocked(PlaybackRepository.getRemoteTranscriptByUrl).mockResolvedValue({
      id: 'remote-1',
      url: 'https://example.com/audio.mp3',
      cues: [{ start: 0, end: 1, text: 'Remote cue' }],
      cueSchemaVersion: 1,
      fetchedAt: Date.now(),
    })

    await expect(
      hasStoredTranscriptSource('https://example.com/audio.mp3', 'track-1')
    ).resolves.toBe(true)
  })
})
