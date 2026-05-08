import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import { loadSessionSubtitleCues } from '../localSessionRestore'

vi.mock('../../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getSubtitle: vi.fn(),
  },
}))

describe('localSessionRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when session has no subtitle id', async () => {
    await expect(loadSessionSubtitleCues({ subtitleId: null })).resolves.toBeNull()
    expect(PlaybackRepository.getSubtitle).not.toHaveBeenCalled()
  })

  it('returns stored cues when subtitle exists', async () => {
    vi.mocked(PlaybackRepository.getSubtitle).mockResolvedValue({
      id: 'subtitle-1',
      filename: 'episode.srt',
      cues: [{ start: 0, end: 1, text: 'cue' }],
      sizeBytes: 1,
      createdAt: 1,
    } as never)

    await expect(loadSessionSubtitleCues({ subtitleId: 'subtitle-1' })).resolves.toEqual([
      { start: 0, end: 1, text: 'cue' },
    ])
  })
})
