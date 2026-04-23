import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetRequestManagerStateForTests } from '../../lib/requestManager'

vi.mock('../../lib/repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getAllPlaybackSessions: vi.fn().mockResolvedValue([]),
    deletePlaybackSession: vi.fn().mockResolvedValue(undefined),
    getAudioBlob: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../lib/repositories/FilesRepository', () => ({
  FilesRepository: {
    getFileTrack: vi.fn().mockResolvedValue(undefined),
    getAudioBlob: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('historyStore repository boundary', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const { __testOnlyResetHistoryStoreFlags } = await import('../historyStore')
    __testOnlyResetHistoryStoreFlags()
    __resetRequestManagerStateForTests()
  })

  it('delegates load and delete operations to repositories', async () => {
    const { useHistoryStore } = await import('../historyStore')
    const { PlaybackRepository } = await import('../../lib/repositories/PlaybackRepository')

    await useHistoryStore.getState().loadSessions()
    await useHistoryStore.getState().deleteSession('session-1')

    expect(PlaybackRepository.getAllPlaybackSessions).toHaveBeenCalledTimes(1)
    expect(PlaybackRepository.deletePlaybackSession).toHaveBeenCalledWith('session-1')
  })

  it('coalesces concurrent deleteSession calls for the same id', async () => {
    const { useHistoryStore } = await import('../historyStore')
    const { PlaybackRepository } = await import('../../lib/repositories/PlaybackRepository')

    let resolveDelete: (() => void) | undefined
    const deleteGate = new Promise<void>((resolve) => {
      resolveDelete = resolve
    })
    vi.mocked(PlaybackRepository.deletePlaybackSession).mockImplementationOnce(async () => {
      await deleteGate
    })

    const first = useHistoryStore.getState().deleteSession('session-1')
    const second = useHistoryStore.getState().deleteSession('session-1')
    resolveDelete?.()
    await Promise.all([first, second])

    expect(PlaybackRepository.deletePlaybackSession).toHaveBeenCalledTimes(1)
    expect(PlaybackRepository.deletePlaybackSession).toHaveBeenCalledWith('session-1')
  })

  it('keeps shared deleteSession write alive when first caller aborts', async () => {
    const { useHistoryStore } = await import('../historyStore')
    const { PlaybackRepository } = await import('../../lib/repositories/PlaybackRepository')

    useHistoryStore.setState({
      sessions: [
        {
          id: 'session-1',
          source: 'explore',
          title: 'Episode',
          createdAt: Date.now(),
          lastPlayedAt: Date.now(),
          sizeBytes: 0,
          hasAudioBlob: false,
          progress: 0,
          audioFilename: '',
          subtitleFilename: '',
          audioId: null,
          subtitleId: null,
          audioUrl: 'https://example.com/audio.mp3',
          durationSeconds: 0,
          countryAtSave: 'us',
        },
      ],
    })

    let resolveDelete: (() => void) | undefined
    const deleteGate = new Promise<void>((resolve) => {
      resolveDelete = resolve
    })
    vi.mocked(PlaybackRepository.deletePlaybackSession).mockImplementationOnce(async () => {
      await deleteGate
    })

    const firstController = new AbortController()
    const first = useHistoryStore.getState().deleteSession('session-1', firstController.signal)
    const second = useHistoryStore.getState().deleteSession('session-1')

    firstController.abort()
    resolveDelete?.()
    await Promise.all([first.catch(() => {}), second])

    expect(PlaybackRepository.deletePlaybackSession).toHaveBeenCalledTimes(1)
    expect(useHistoryStore.getState().sessions).toHaveLength(0)
  })
})
